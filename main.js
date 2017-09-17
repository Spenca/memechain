var CryptoJS = require("crypto-js");
var express = require("express");
var bodyParser = require("body-parser");
var WebSocket = require("ws");

var httpPort = process.env.HTTP_PORT || 3001;
var p2pPort = process.env.P2P_PORT || 6001;
var initialPeers = process.env.PEERS ? process.env.PEERS.split(",") : [];

class Block {
	constructor(index, previousHash, data, hash, author) {
		this.index = index;
		this.previousHash = previousHash;
		this.data = data;
		this.hash = hash;
		this.author = author;
		this.timestamp = new Date().getTime();
	}
}

var sockets = [];
var messageType = {
	QUERY_LATEST: 0,
  QUERY_ALL: 1,
  RESPONSE_BLOCKCHAIN: 2
};

var getGenesisBlock = () => {
	return new Block(0, "0", {"title": "Rarest Pepe","image_url": "https://imgur.com/pEMGBhR"}, "a3e73f3079c231148bc55eac355bc2b0950e2ee4994b5d0bbfb95388c0dd0dfa", "James and Spencer");
};

var blockchain = [getGenesisBlock()];

var getLatestBlock = () => {
	return blockchain[blockchain.length - 1];
};

var calculateHash = (index, previousHash, data, author) => {
	return CryptoJS.SHA256(index + previousHash + data + author).toString();
};

var calculateHashForBlock = (block) => {
	return calculateHash(block.index, block.previousHash, block.data, block.author);
};

var makeNewBlock = (blockData, blockAuthor) => {
	var previousBlock = getLatestBlock();
	var newIndex = previousBlock.index + 1;
	var newHash = calculateHash(newIndex, previousBlock.hash, blockData, blockAuthor);
	return new Block(newIndex, previousBlock.hash, blockData, newHash, blockAuthor);
};

var verifyBlock = (newBlock, previousBlock) => {

	if (previousBlock.index + 1 !== newBlock.index) {
		console.log("Invalid index.");
		return false;
	} else if (previousBlock.hash !== newBlock.previousHash) {
		console.log("Invalid previous hash.");
		return false;
	}	else if (calculateHashForBlock(newBlock) !== newBlock.hash) {
		console.log("Invalid hash.");
		return false;
	}
	return true;
};

var verifyChain = (blockchain) => {
	if (JSON.stringify(blockchain[0]) !== JSON.stringify(getGenesisBlock())) {
		return false;
	}
	var blocksToVerify = blockchain[0];
	for (var i = 1; i < blockchain.length; i++) {
		if (verifyBlock(blockchain[i], blocksToVerify[i - 1])) {
			blocksToVerify.push(blockchain[i]);
		} else {
			return false;
		}
	}
	return true;
};

var latestBlockResponse = () => ({
	"type": messageType.RESPONSE_BLOCKCHAIN, 
	"data": JSON.stringify([getLatestBlock()])
});

var replaceChain = (newBlocks) => {
	if (verifyChain() && newBlocks.length > blockchain.length) {
		console.log("Received blockchain is valid. Replacing current blockchain with it.");
		blockchain = newBlocks;
		broadcast(latestBlockResponse());
	} else {
		console.log("Received blockchain is invalid.");
	}
};

var addBlockToChain = (newBlock) => {
	if (verifyBlock(newBlock, getLatestBlock())) {
		blockchain.push(newBlock);
	}
};

var connectToPeers = (newPeers) => {
	newPeers.forEach((peer) => {
		var ws = new WebSocket(peer);
		ws.on("open", () => startConnection(ws));
		ws.on("error", () => {
			console.log("Connection failed.")
		});
	});
};

var handleBlockchainResponse = (message) => {
	var receivedBlocks = JSON.parse(message.data).sort((b1, b2) => (b1.index - b2.index));
    var latestBlockReceived = receivedBlocks[receivedBlocks.length - 1];
    var latestBlockHeld = getLatestBlock();
    if (latestBlockReceived.index > latestBlockHeld.index) {
      console.log("Your blockchain is possibly behind. You have: " + latestBlockHeld.index + " Peer has: " + latestBlockReceived.index);
      if (latestBlockHeld.hash === latestBlockReceived.previousHash) {
        console.log("We can append the received block to our chain");
        blockchain.push(latestBlockReceived);
        broadcast(latestBlockResponse());
      } else if (receivedBlocks.length === 1) {
        console.log("We have to query the chain from our peer");
        broadcast(queryAllMsg());
      } else {
        console.log("Received blockchain is longer than current blockchain");
        replaceChain(receivedBlocks);
      }
    } else {
      console.log("Received blockchain is not longer than current blockchain. Do nothing.");
    }
};

var queryChainLengthMsg = () => ({"type": messageType.QUERY_LATEST});

var queryAllMsg = () => ({"type": messageType.QUERY_ALL});

var responseChainMsg = () =>({
	"type": messageType.RESPONSE_BLOCKCHAIN, 
	"data": JSON.stringify(blockchain)
});

var startHTTPServer = () => {
	var app = express();
	app.use(bodyParser.json());

	app.get("/blocks", (req, res) => res.send(JSON.stringify(blockchain)));
	
	app.post("/mineBlock", (req, res) => {
		var newBlock = makeNewBlock(req.body.data, req.body.author);
		addBlockToChain(newBlock);
		broadcast(latestBlockResponse());
		console.log("Block added: " + JSON.stringify(newBlock));
		res.send();
	});

	app.get("/peers", (req, res) => {
  	res.send(sockets.map(s => s._socket.remoteAddress + ":" + s._socket.remotePort));
  });
  
  app.post("/addPeer", (req, res) => {
    connectToPeers([req.body.peer]);
    res.send();
  });
  
  // app.post("/buyMeme", (req, res) => {
  // 	var hash = req.body.hash;
  // 	var descendingChain = blockchain.sort((b1, b2) => (b2.index - b1.index));
  // 	descendingChain.forEach((block) => {
  		
  // 	});
  // });
  app.listen(httpPort, () => console.log("Listening for HTTP on port: " + httpPort));
};

var startP2PServer = () => {
	var server = new WebSocket.Server({port: p2pPort});
  server.on("connection", ws => startConnection(ws));
 	console.log("Listening for WebSocket P2P on port: " + p2pPort);
};

var startConnection = (ws) => {
	sockets.push(ws);
  startMessageHandler(ws);
  startErrorHandler(ws);
  write(ws, queryChainLengthMsg());
};

var startMessageHandler = (ws) => {
	ws.on("message", (data) => {
		var message = JSON.parse(data);
      console.log("Received message" + JSON.stringify(message));
      switch (message.type) {
        case messageType.QUERY_LATEST:
          write(ws, latestBlockResponse());
          break;
        case messageType.QUERY_ALL:
          write(ws, responseChainMsg());
          break;
        case messageType.RESPONSE_BLOCKCHAIN:
          handleBlockchainResponse(message);
          break;
      }
	});
};

var startErrorHandler = (ws) => {
	var closeConnection = (ws) => {
    console.log("Connection to peer: " + ws.url + "failed.");
    sockets.splice(sockets.indexOf(ws), 1);
	};
	ws.on('close', () => closeConnection(ws));
	ws.on('error', () => closeConnection(ws));
};

var write = (ws, message) => ws.send(JSON.stringify(message));
var broadcast = (message) => sockets.forEach(socket => write(socket, message));

connectToPeers(initialPeers);
startHTTPServer();
startP2PServer();
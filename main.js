var CryptoJS = require("crypto-js");
var express = require("express");
var bodyParser = require("body-parser");
var WebSocket = require("ws");

var httpPort = process.env.HTTP_PORT || 3001;
var p2pPort = process.env.P2P_PORT || 6001;
var initialPeers = process.env.PEERS ? process.env.PEERS.split(",") : [];

class Block {
	constructor(index, previousHash, data, hash) {
		this.index = index;
		this.previousHash = previousHash;
		this.data = data;
		this.hash = hash;
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
	return new Block(0, "0", {"title": "Rarest Pepe","image_url": "https://imgur.com/pEMGBhR"}, "a3e73f3079c231148bc55eac355bc2b0950e2ee4994b5d0bbfb95388c0dd0dfa");
};

var blockchain = [getGenesisBlock()];

var getLatestBlock = () => {
	return blockchain[blockchain.length - 1];
};

var calculateHash = (index, previousHash, data) => {
	return CryptoJS.SHA256(index + previousHash + data).toString();
};

var calculateHashForBlock = (block) => {
	return calculateHash(block.index, block.previousHash, block.data);
};

var makeNewBlock = (blockData) => {
	var previousBlock = getLatestBlock();
	var newIndex = previousBlock.index + 1;
	var newHash = calculateHash(newIndex, previousBlock.hash, blockData);
	return new Block(newIndex, previousBlock.hash, blockData, newHash);
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

};

var handleBlockchainResponse = (message) => {

};

var queryChainLengthMsg = () => ({"type": MessageType.QUERY_LATEST});

var queryAllMsg = () => ({"type": MessageType.QUERY_ALL});

var responseChainMsg = () =>({
	"type": MessageType.RESPONSE_BLOCKCHAIN, 
	"data": JSON.stringify(blockchain)
});

var startHTTPServer = () => {
	var app = express();
	app.use(bodyParser.json());

	app.get("/blocks", (req, res) => res.send(JSON.stringify(blockchain)));
	
	app.post("mineBlock", (req, res) => {
		var newBlock = makeNewBlock(req.body.data);
		addBlockToChain(newBlock);
		broadcast(latestBlockResponse());
		console.log("Block added: " + JSON.stringify(newBlock) +".");
		res.send();
	});

	app.get("/peers", (req, res) => {
  	res.send(sockets.map(s => s._socket.remoteAddress + ":" + s._socket.remotePort));
  });
  
  app.post("/addPeer", (req, res) => {
    connectToPeers([req.body.peer]);
    res.send();
  });
  
  app.listen(httpPort, () => console.log("Listening for HTTP on port: " + httpPort + "."));
};

var startP2PServer = () => {

};

var startConnection = (ws) => {

};

var startMessageHandler = (ws) => {

};

var startErrorHandler = (ws) => {

};

var write = (ws, message) => ws.send(JSON.stringify(message));
var broadcast = (message) => sockets.forEach(socket => write(socket, message));

connectToPeers(initialPeers);
startHTTPServer();
startP2PServer();
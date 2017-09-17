/**
 * Module dependencies.
 */
const express = require('express');
const compression = require('compression');
const session = require('express-session');
const bodyParser = require('body-parser');
const logger = require('morgan');
const chalk = require('chalk');
const errorHandler = require('errorhandler');
const lusca = require('lusca');
const dotenv = require('dotenv');
const MongoStore = require('connect-mongo')(session);
const flash = require('express-flash');
const path = require('path');
const mongoose = require('mongoose');
const passport = require('passport');
const expressValidator = require('express-validator');
const expressStatusMonitor = require('express-status-monitor');
const sass = require('node-sass-middleware');
const multer = require('multer');
const WebSocket = require("ws");
const CryptoJS = require("crypto-js");

const upload = multer({ dest: path.join(__dirname, 'uploads') });

var httpPort = process.env.HTTP_PORT || 8080;
var p2pPort = process.env.P2P_PORT || 6001;
var initialPeers = process.env.PEERS ? process.env.PEERS.split(",") : [];


/**
 * Create Express server.
 */
var app = express();

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
  } else if (calculateHashForBlock(newBlock) !== newBlock.hash) {
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



/**
 * Load environment variables from .env file, where API keys and passwords are configured.
 */
dotenv.load({ path: '.env.example' });

/**
 * Controllers (route handlers).
 */
const homeController = require('./controllers/home');
const userController = require('./controllers/user');
const apiController = require('./controllers/api');
const contactController = require('./controllers/contact');

/**
 * API keys and Passport configuration.
 */
const passportConfig = require('./config/passport');


/**
 * Connect to MongoDB.
 */
mongoose.Promise = global.Promise;
mongoose.connect(process.env.MONGODB_URI || process.env.MONGOLAB_URI);
mongoose.connection.on('error', (err) => {
  console.error(err);
  console.log('%s MongoDB connection error. Please make sure MongoDB is running.', chalk.red('✗'));
  process.exit();
});

/**
 * Express configuration.
 */
app.set('host', process.env.OPENSHIFT_NODEJS_IP || '0.0.0.0');
app.set('port', process.env.PORT || process.env.OPENSHIFT_NODEJS_PORT || 8080);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');
app.use(expressStatusMonitor());
app.use(compression());
app.use(sass({
  src: path.join(__dirname, 'public'),
  dest: path.join(__dirname, 'public')
}));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(expressValidator());
app.use(session({
  resave: true,
  saveUninitialized: true,
  secret: process.env.SESSION_SECRET,
  store: new MongoStore({
    url: process.env.MONGODB_URI || process.env.MONGOLAB_URI,
    autoReconnect: true,
    clear_interval: 3600
  })
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());
app.use((req, res, next) => {
  if (req.path === '/api/upload') {
    next();
  } else {
    lusca.csrf()(req, res, next);
  }
});
app.use(lusca.xframe('SAMEORIGIN'));
app.use(lusca.xssProtection(true));
app.use((req, res, next) => {
  res.locals.user = req.user;
  next();
});
app.use((req, res, next) => {
  // After successful login, redirect back to the intended page
  if (!req.user &&
      req.path !== '/login' &&
      req.path !== '/signup' &&
      !req.path.match(/^\/auth/) &&
      !req.path.match(/\./)) {
    req.session.returnTo = req.path;
  } else if (req.user &&
      req.path === '/account') {
    req.session.returnTo = req.path;
  }
  next();
});
app.use(express.static(path.join(__dirname, 'public'), { maxAge: 31557600000 }));

/**
 * Primary app routes.
 */
app.get('/', function (req, res) {
  res.render('home', {
    title: 'Home',
    memes: blockchain
  });
});
app.get('/login', userController.getLogin);
app.post('/login', userController.postLogin);
app.get('/logout', userController.logout);
app.get('/forgot', userController.getForgot);
app.post('/forgot', userController.postForgot);
app.get('/reset/:token', userController.getReset);
app.post('/reset/:token', userController.postReset);
app.get('/signup', userController.getSignup);
app.post('/signup', userController.postSignup);
app.get('/contact', contactController.getContact);
app.post('/contact', contactController.postContact);
app.get('/account', passportConfig.isAuthenticated, userController.getAccount);
app.post('/account/profile', passportConfig.isAuthenticated, userController.postUpdateProfile);
app.post('/account/password', passportConfig.isAuthenticated, userController.postUpdatePassword);
app.post('/account/delete', passportConfig.isAuthenticated, userController.postDeleteAccount);
app.get('/account/unlink/:provider', passportConfig.isAuthenticated, userController.getOauthUnlink);

/**
 * API examples routes.
 */
app.get('/api', apiController.getApi);
app.get('/api/google-maps', apiController.getGoogleMaps);

app.get('/auth/google', passport.authenticate('google', { scope: 'profile email' }));
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/login' }), (req, res) => {
  res.redirect(req.session.returnTo || '/');
});

var startP2PServer = () => {
  var server = new WebSocket.Server({port: p2pPort});
  server.on("connection", ws => startConnection(ws));
  console.log("Listening for websocket P2P on port: " + p2pPort);
};

var startHTTPServer = () => {
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
  //  var hash = req.body.hash;
  //  var descendingChain = blockchain.sort((b1, b2) => (b2.index - b1.index));
  //  descendingChain.forEach((block) => {
      
  //  });
  // });
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

/**
 * Error Handler.
 */
app.use(errorHandler());

/**
 * Start Express server.
 */
app.listen(app.get('port'), () => {
  console.log('%s App is running at http://localhost:%d in %s mode', chalk.green('✓'), app.get('port'), app.get('env'));
  console.log('  Press CTRL-C to stop\n');
});

module.exports = app;

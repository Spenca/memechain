var CryptoJS = require("crypto-js");
var express = require("express");

class Block {
	constructor(index, previousHash, data, hash) {
		this.index = index;
		this.previousHash = previousHash;
		this.data = data;
		this.hash = hash;
		this.timestamp = new Date().getTime();
	}
}

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
};

var replaceChain = (newBlocks) => {
	if (verifyChain() && newBlocks.length > blockchain.length) {
		console.log("Received blockchain is valid. Replacing current blockchain with it.");
		blockchain = newBlocks;
		// broadcast(responseLatestMsg());
	} else {
		console.log("Received blockchain is invalid.");
	}
};

var startHTTPServer = () => {

};
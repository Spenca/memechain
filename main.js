var CryptoJS = require("crypto-js");

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
}

var blockchain = [getGenesisBlock()];

var getLatestBlock = () => {
	return blockchain[blockchain.length - 1];
}

var calculateHash = (index, previousHash, data) => {
	return CryptoJS.SHA256(index + previousHash + data).toString();
};

var makeNewBlock = (blockData) => {
	var previousBlock = getLatestBlock();
	var newIndex = previousBlock.index + 1;
	var newHash = calculateHash(newIndex, previousBlock.hash, blockData);
	return new Block(newIndex, previousBlock.hash, blockData, newHash);
}


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

var calculateHash = (index, previousHash, data) => {
	return CryptoJS.SHA256(index + previousHash + data).toString();
};


var CryptoJS = require("crypto-js");

var calculateHash = (index, previousHash, data) => {
	return CryptoJS.SHA256(index + previousHash + data).toString();
};
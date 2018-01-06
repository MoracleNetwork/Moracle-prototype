let token = require('./Moracle-Token');
let lotion = require('lotion');
var fs = require("fs");
var shea = require("shea");
const express = require('express');
var axios = require("axios");


// Lotion / Tendermint setup

let client = token.client();

if (!fs.existsSync('addresses.json')) {
  console.log("No key file found, generating Moracle address.");
  var key = client.generatePrivateKey();
  var pubkey = client.generatePublicKey(key);
  var address = client.generateAddress(pubkey);

  var addresses_object = [];
  addresses_object.push({ 'privatekey': key.toString('hex'), 'publickey': pubkey.toString('hex'), 'address': address.toString('hex') });
  fs.writeFileSync('addresses.json', JSON.stringify(addresses_object));
  console.log("Keys saved to addresses.json");
} else {
  console.log("Loading private keys from file.");
  var address_file = fs.readFileSync('addresses.json');
  var addresses_list = JSON.parse(address_file);
  var key = Buffer.from(addresses_list[0].privatekey, 'hex');
  var pubkey = client.generatePublicKey(key);
  var address = client.generateAddress(pubkey);
}

console.log("Address: " + address.toString("hex"));



let app = lotion({
  initialState: {
    pendingRequests: [],
    balances: {
      '57162ecf4008ca8ba81ae09d2018015058a12dec12ee434b660be76be11f4f28': 2600000,
    },
    nonces: {}
  },
  createEmptyBlocks: false,
  logTendermint: true,
  genesis: 'genesis.json',
  keys: 'keys.json',
  p2pPort: 46658,
});


app.use(token.handler);

app.listen(3000);



const localApiApp = express();

localApiApp.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

var url = "http://localhost:3000";
localApiApp.get('/', function (req, res) {
  res.sendFile(__dirname + '/client.html');
});
//passthrough since lotion.js's default server doesn't have proper CORS support
localApiApp.get('/state', function (req, res) {
  axios.get(url + '/state')
    .then(function (_response) {
      res.send(JSON.stringify(_response.data));
    })
    .catch(function (error) {
      console.log(error);
    });
});
localApiApp.get('/txs', function (req, res) {
  axios.get(url + '/txs')
    .then(function (_response) {
      res.send(JSON.stringify(_response.data));
    })
    .catch(function (error) {
      console.log(error);
    });
});
localApiApp.get('/getaddress', function (req, res) {
  res.send(address.toString('hex'));
});
localApiApp.get('/baltransfer', function (req, res) {
  client.send(key, {
    amount: parseInt(req.query.amount),
    address: req.query.address,
  });
  res.send('transfer processed');
});

localApiApp.listen(4242, () => console.log('Go to localhost:4242'));


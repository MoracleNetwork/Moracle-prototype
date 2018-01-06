// based on lotion-coin
// keppel is a hero

let secp256k1 = require('secp256k1')
let { randomBytes } = require('crypto')
let createHash = require('sha.js')
let vstruct = require('varstruct')
let axios = require('axios')
var sha1 = require('sha1');

let TxStruct = vstruct([
    { name: 'amount', type: vstruct.UInt64BE },
    { name: 'senderPubKey', type: vstruct.Buffer(33) },
    { name: 'senderAddress', type: vstruct.Buffer(32) },
    { name: 'receiverAddress', type: vstruct.Buffer(32) },
    { name: 'nonce', type: vstruct.UInt32BE }
])

exports.handler = function (state, rawTx) {
    let tx = deserializeTx(rawTx)
    if (!verifyTx(tx)) {
        console.log("invalid transaction");
        return
    }

    let senderAddress = tx.senderAddress.toString('hex')
    let receiverAddress = tx.receiverAddress.toString('hex')

    let senderBalance = state.balances[senderAddress] || 0
    let receiverBalance = state.balances[receiverAddress] || 0

    if (senderAddress === receiverAddress) {
        console.log("cannot send tokens to yourself");
        return
    }
    if (!Number.isInteger(tx.amount)) {
        console.log("amount is not integer");
        return
    }
    if (tx.amount + 1 > senderBalance) {
        console.log("amount is not greater than balance");
        return
    }
    if (tx.nonce !== (state.nonces[senderAddress] || 0)) {
        console.log("invalid nonce");
        return
    }
    senderBalance -= tx.amount + 1
    receiverBalance += tx.amount - 1
    // fee

    state.balances[senderAddress] = senderBalance
    state.balances[receiverAddress] = receiverBalance
    state.nonces[senderAddress] = (state.nonces[senderAddress] || 0) + 1


    if (tx['transactionType'] == 'notarize') {
        var data_hash = sha1(tx['data']);
        console.log('Inserting notarized message into state.');
        state.notarizedMessages[data_hash] = tx['data'];
    }
}

function hashTx(tx) {
    let txBytes = TxStruct.encode({
        amount: tx.amount,
        senderPubKey: tx.senderPubKey,
        senderAddress: tx.senderAddress,
        nonce: tx.nonce,
        receiverAddress: tx.receiverAddress
    })
    let txHash = createHash('sha256')
        .update(txBytes)
        .digest()

    return txHash
}

function signTx(privKey, tx) {
    let txHash = hashTx(tx)
    let signedTx = Object.assign({}, tx)
    let { signature } = secp256k1.sign(txHash, privKey)
    signedTx.signature = signature

    return signedTx
}

function verifyTx(tx) {
    if (
        deriveAddress(tx.senderPubKey).toString('hex') !==
        tx.senderAddress.toString('hex')
    ) {
        return false
    }
    let txHash = hashTx(tx)
    return secp256k1.verify(txHash, tx.signature, tx.senderPubKey)
}

function serializeTx(tx) {
    let serializable = Object.assign({}, tx)
    for (let key in tx) {
        if (Buffer.isBuffer(tx[key])) {
            serializable[key] = tx[key].toString('base64')
        }
    }
    return serializable
}

function deserializeTx(tx) {
    let deserialized = tx
        ;[
            'senderPubKey',
            'senderAddress',
            'receiverAddress',
            'signature'
        ].forEach(key => {
            deserialized[key] = Buffer.from(deserialized[key], 'base64')
        })

    return deserialized
}

function deriveAddress(pubKey) {
    return createHash('sha256')
        .update(pubKey)
        .digest()
}

exports.client = function (url = 'http://localhost:3000') {
    let methods = {
        generatePrivateKey: () => {
            let privKey
            do {
                privKey = randomBytes(32)
            } while (!secp256k1.privateKeyVerify(privKey))

            return privKey
        },
        generatePublicKey: privKey => {
            return secp256k1.publicKeyCreate(privKey)
        },
        generateAddress: pubKey => {
            return deriveAddress(pubKey)
        },
        getBalance: async (address) => {
            let state = await axios.get(url + '/state').then(res => res.data)
            return state.balances[address] || 0
        },
        send: async (privKey, { address, amount }) => {
            let senderPubKey = methods.generatePublicKey(privKey)
            let senderAddress = methods.generateAddress(senderPubKey)

            let currentState = await axios.get(url + '/state').then(res => res.data)

            let nonce = currentState.nonces[senderAddress.toString('hex')] || 0

            let receiverAddress
            if (typeof address === 'string') {
                receiverAddress = Buffer.from(address, 'hex')
            } else {
                receiverAddress = address
            }
            let tx = {
                amount,
                senderPubKey,
                senderAddress,
                receiverAddress,
                nonce
            }

            let signedTx = signTx(privKey, tx)
            let serializedTx = serializeTx(signedTx)
            serializedTx['transactionType'] = 'balance-transfer';
            console.log(JSON.stringify(serializedTx));
            let result = await axios.post(url + '/txs', serializedTx)
            return result.data
        },
        notarize: async (privKey, { data }) => {
            let senderPubKey = methods.generatePublicKey(privKey)
            let senderAddress = methods.generateAddress(senderPubKey)

            let currentState = await axios.get(url + '/state').then(res => res.data)

            let nonce = currentState.nonces[senderAddress.toString('hex')] || 0

            let receiverAddress = Buffer.from('56b05eb78ec46abe7c4a292b236a21d8a53b5350bb97dfbe32e316f44a27f5cc', 'hex');
            // this address affectively burns the tokens
            let amount = 15;
            // fixed notary fee.

            let tx = {
                amount,
                senderPubKey,
                senderAddress,
                receiverAddress,
                nonce
            }

            let signedTx = signTx(privKey, tx)
            let serializedTx = serializeTx(signedTx)
            serializedTx['transactionType'] = 'notarize';
            serializedTx['data'] = data;
            console.log(JSON.stringify(serializedTx));
            let result = await axios.post(url + '/txs', serializedTx)
            return result.data
        }
    }

    return methods
}
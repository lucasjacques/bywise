import request from 'supertest';
import helper from '../utils/helper';
import { Block, BlockPack, Wallet } from '@bywise/web3';
import { ChainConfig } from '../types';
import Bywise from '../bywise';
import { ConfigProvider } from '../services/configs.service';

var node0: Bywise;
var node1: Bywise;
var node2: Bywise;
var b0: BlockPack;
const blockDelay = 3000;
const chain = 'local';
const port0 = Math.floor(Math.random() * 7000 + 3000);
const port1 = Math.floor(Math.random() * 7000 + 3000);
const port2 = Math.floor(Math.random() * 7000 + 3000);
const node0Wallet = new Wallet();
const node1Wallet = new Wallet();
const node2Wallet = new Wallet();

beforeAll(async () => {
    b0 = await helper.createNewBlockZero(chain, node0Wallet, [
        ChainConfig.addAdmin(node0Wallet.address),
        ChainConfig.addValidator(node0Wallet.address),
        ChainConfig.setBalance(node0Wallet.address, ConfigProvider.MIN_BWS_VALUE),
        ChainConfig.addAdmin(node1Wallet.address),
        ChainConfig.addValidator(node1Wallet.address),
        ChainConfig.setBalance(node1Wallet.address, ConfigProvider.MIN_BWS_VALUE),
        ChainConfig.addAdmin(node2Wallet.address),
        ChainConfig.addValidator(node2Wallet.address),
        ChainConfig.setBalance(node2Wallet.address, ConfigProvider.MIN_BWS_VALUE),
        ChainConfig.setConfig('blockTime', `${blockDelay / 1000}`),
    ]);

    node0 = await Bywise.newBywiseInstance({
        name: `test${port0}`,
        port: port0,
        keyJWT: helper.getRandomString(),
        isLog: process.env.BYWISE_TEST !== '1',
        isReset: true,
        myHost: `http://localhost:${port0}`,
        initialNodes: [],
        zeroBlocks: [],
        mainWalletSeed: node0Wallet.seed,
        startServices: ['api', 'core'],
    });

    node1 = await Bywise.newBywiseInstance({
        name: `test${port1}`,
        port: port1,
        keyJWT: helper.getRandomString(),
        isLog: process.env.BYWISE_TEST !== '1',
        isReset: true,
        myHost: `http://localhost:${port1}`,
        initialNodes: [`http://localhost:${port0}`, `http://localhost:${port2}`],
        zeroBlocks: [],
        mainWalletSeed: node1Wallet.seed,
        startServices: ['api', 'core'],
    });

    node2 = await Bywise.newBywiseInstance({
        name: `test${port2}`,
        port: port2,
        keyJWT: helper.getRandomString(),
        isLog: process.env.BYWISE_TEST !== '1',
        isReset: true,
        myHost: `http://localhost:${port2}`,
        initialNodes: [],
        zeroBlocks: [],
        mainWalletSeed: node2Wallet.seed,
        startServices: ['api', 'core'],
    });
}, 60000);

beforeEach(async () => {
    await node0.core.stop();
    await node1.core.stop();
    await node2.core.stop();

    await helper.sleep(1000);

    await node0.core.network.resetNetwork();
    await node1.core.network.resetNetwork();
    await node2.core.network.resetNetwork();

    await node0.applicationContext.database.drop();
    await node1.applicationContext.database.drop();
    await node2.applicationContext.database.drop();

    await node0.core.blockProvider.setNewZeroBlock(b0);
    await node1.core.blockProvider.setNewZeroBlock(b0);
    await node2.core.blockProvider.setNewZeroBlock(b0);

    await node0.core.network.start();
    await node0.core.network.mainLoop();
    await node2.core.network.start();
    await node2.core.network.mainLoop();
}, 60000)

afterAll(async () => {
    await node0.stop();
    await node1.stop();
    await node2.stop();
}, 60000)

const connectNodes = async () => {
    expect(node0.core.network.connectedNodesSize()).toEqual(0);
    expect(node1.core.network.connectedNodesSize()).toEqual(0);
    expect(node2.core.network.connectedNodesSize()).toEqual(0);

    await node1.core.network.start();
    await node1.core.network.mainLoop();
    await node0.core.network.mainLoop();
    await node2.core.network.mainLoop();

    expect(node0.core.network.connectedNodesSize()).toEqual(2);
    expect(node1.core.network.connectedNodesSize()).toEqual(2);
    expect(node2.core.network.connectedNodesSize()).toEqual(2);
}

describe('propagation test', () => {
    test('test enviroment', async () => {
        await connectNodes();

        let res = await request(node0.api.server)
            .get('/api/v2/blocks/last/' + chain)
        expect(res.status).toEqual(200);
        expect(res.body.length).toEqual(1);

        res = await request(node1.api.server)
            .get('/api/v2/blocks/last/' + chain)
        expect(res.status).toEqual(200);
        expect(res.body.length).toEqual(1);

        res = await request(node2.api.server)
            .get('/api/v2/blocks/last/' + chain)
        expect(res.status).toEqual(200);
        expect(res.body.length).toEqual(1);
    });

    test('test simple propagation', async () => {
        await connectNodes();

        await node0.core.runCore();
        await helper.sleep(blockDelay * 3);
        await node0.core.stop();

        let res = await request(node0.api.server)
            .get('/api/v2/blocks/last/' + chain)
        expect(res.status).toEqual(200);
        expect(res.body.length).toBeGreaterThan(1);

        res = await request(node1.api.server)
            .get('/api/v2/blocks/last/' + chain)
        expect(res.status).toEqual(200);
        expect(res.body.length).toBe(1);

        res = await request(node1.api.server)
            .get('/api/v2/blocks/last/' + chain + '?status=mempool')
        expect(res.status).toEqual(200);
        expect(res.body.length).toBeGreaterThan(0);
    }, blockDelay * 5);
    
    test('sync nodes', async () => {
        await node0.core.runCore();
        await helper.sleep(blockDelay * 6);
        await node0.core.stop();

        let res = await request(node0.api.server)
            .get('/api/v2/blocks/last/' + chain)
        expect(res.status).toEqual(200);
        expect(res.body.length).toBeGreaterThanOrEqual(5);
        const blocksNode0 = res.body;

        res = await request(node1.api.server)
            .get('/api/v2/blocks/last/' + chain)
        expect(res.status).toEqual(200);
        expect(res.body.length).toEqual(1);

        res = await request(node1.api.server)
            .get('/api/v2/blocks/last/' + chain + '?status=mempool')
        expect(res.status).toEqual(200);
        expect(res.body.length).toEqual(0);

        // node 0 created 5 blocks and node 1 does not know the blocks
        await connectNodes();
        await node1.core.runCore();
        await helper.sleep(blockDelay * 6); // sync chains and create more 5 blocks

        res = await request(node1.api.server)
            .get('/api/v2/blocks/last/' + chain)
        expect(res.status).toEqual(200);
        expect(res.body.length).toBeGreaterThan(10);
        const blocksNode1 = res.body.reverse();

        for (let i = 1; i < blocksNode1.length; i++) {
            if (i < blocksNode0.length - 1) {
                expect(blocksNode1[i].from).toEqual(node0.applicationContext.mainWallet.address);
            } else if (i > blocksNode0.length) {
                expect(blocksNode1[i].from).toEqual(node1.applicationContext.mainWallet.address);
            }
        }
    }, blockDelay * 15);
    
    test('multiple validators', async () => {
        await node0.core.runCore();
        await helper.sleep(blockDelay * 3); // start alone

        await connectNodes();

        await node1.core.runCore();
        await node2.core.runCore();
        await helper.sleep(blockDelay * 9); // sync and build new blocks with multiple validators

        let blocksNode0: Block[] = []
        let blocksNode1: Block[] = []
        let blocksNode2: Block[] = []

        let res = await request(node0.api.server)
            .get('/api/v2/blocks/last/' + chain)
        expect(res.status).toEqual(200);
        blocksNode0 = res.body.reverse();

        res = await request(node1.api.server)
            .get('/api/v2/blocks/last/' + chain)
        expect(res.status).toEqual(200);
        blocksNode1 = res.body.reverse();

        res = await request(node2.api.server)
            .get('/api/v2/blocks/last/' + chain)
        expect(res.status).toEqual(200);
        blocksNode2 = res.body.reverse();

        expect(blocksNode0.length).toBeGreaterThanOrEqual(10);
        expect(blocksNode1.length).toBeGreaterThanOrEqual(10);
        expect(blocksNode2.length).toBeGreaterThanOrEqual(10);

        let fromAddress: string[] = [];
        for (let i = 0; i < 10; i++) {
            const b0 = blocksNode0[i];
            const b1 = blocksNode1[i];
            const b2 = blocksNode2[i];

            expect(b0.hash).toEqual(b1.hash);
            expect(b0.hash).toEqual(b2.hash);

            if (!fromAddress.includes(b2.from)) {
                fromAddress.push(b2.from)
            }
        }
        expect(fromAddress.length).toBeGreaterThanOrEqual(2);
    }, blockDelay * 15);
    
    test('blockchain convergence', async () => {
        let res;
        let blocksNode0: Block[] = []
        let blocksNode1: Block[] = []
        let blocksNode2: Block[] = []

        await node0.core.runCore();
        await node2.core.runCore();
        await helper.sleep(blockDelay * 6);

        expect(node0.core.network.connectedNodesSize()).toEqual(0);
        expect(node2.core.network.connectedNodesSize()).toEqual(0);

        res = await request(node0.api.server)
            .get('/api/v2/blocks/last/' + chain)
        expect(res.status).toEqual(200);
        blocksNode0 = res.body.reverse();

        res = await request(node2.api.server)
            .get('/api/v2/blocks/last/' + chain)
        expect(res.status).toEqual(200);
        blocksNode2 = res.body.reverse();

        // check if different chains
        expect(blocksNode0.length).toBeGreaterThan(3);
        expect(blocksNode2.length).toBeGreaterThan(3);
        for (let i = 1; i < blocksNode0.length && i < blocksNode2.length; i++) {
            const b0 = blocksNode0[i];
            const b2 = blocksNode2[i];
            expect(b0.hash).not.toEqual(b2.hash);
        }

        await node1.core.network.start();
        await node1.core.network.mainLoop();
        await node0.core.network.mainLoop();
        await node2.core.network.mainLoop();
        expect(node0.core.network.connectedNodesSize()).toEqual(2);
        expect(node1.core.network.connectedNodesSize()).toEqual(2);
        expect(node2.core.network.connectedNodesSize()).toEqual(2);
        
        await helper.sleep(blockDelay * 3);
        await node1.core.runCore();
        await helper.sleep(blockDelay * 3);

        res = await request(node0.api.server)
            .get('/api/v2/blocks/last/' + chain)
        expect(res.status).toEqual(200);
        blocksNode0 = res.body.reverse();
        
        res = await request(node1.api.server)
            .get('/api/v2/blocks/last/' + chain)
        expect(res.status).toEqual(200);
        blocksNode1 = res.body.reverse();

        res = await request(node2.api.server)
            .get('/api/v2/blocks/last/' + chain)
        expect(res.status).toEqual(200);
        blocksNode2 = res.body.reverse();

        //console.log('blocksNode0', blocksNode0.map(tx => tx.height + ' ' + tx.hash.substring(0, 10)))
        //console.log('blocksNode1', blocksNode1.map(tx => tx.height + ' ' + tx.hash.substring(0, 10)))
        //console.log('blocksNode2', blocksNode2.map(tx => tx.height + ' ' + tx.hash.substring(0, 10)))

        // checks if the chains have converged
        expect(blocksNode0.length).toBeGreaterThan(10);
        expect(blocksNode1.length).toBeGreaterThan(10);
        expect(blocksNode2.length).toBeGreaterThan(10);
        for (let i = 0; i < 10; i++) {
            const b0 = blocksNode0[i];
            const b1 = blocksNode1[i];
            const b2 = blocksNode2[i];
            expect(b0.hash).toEqual(b2.hash);
        }
    }, blockDelay * 15);
});

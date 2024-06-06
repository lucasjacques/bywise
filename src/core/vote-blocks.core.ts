import { Block, Tx, TxType, Web3 } from "@bywise/web3";
import BigNumber from "bignumber.js";
import { CoreContext } from "../types";
import helper from "../utils/helper";

export default class VoteBlocks {
    public isRun = true;
    private coreContext;
    private currentHeight = 0;

    constructor(coreContext: CoreContext) {
        this.coreContext = coreContext;
    }

    async run() {
        const mainWallet = await this.coreContext.walletProvider.getMainWallet();
        const currentBlock = await this.coreContext.blockTree.currentMinnedBlock;
        
        if (this.currentHeight >= currentBlock.height) {
            return;
        }

        const blockTime = this.coreContext.blockTime;
        const now = helper.getNow();
        const nextVote = currentBlock.created + blockTime / 2;

        if (now < nextVote) {
            return;
        }

        this.currentHeight = currentBlock.height;

        const isMinner = await this.coreContext.configsProvider.isValidator(this.coreContext.blockTree, currentBlock.hash, currentBlock.height, mainWallet.address);
        if (!isMinner) {
            this.coreContext.applicationContext.logger.verbose(`not enabled to mining blocks on chain ${this.coreContext.chain}`);
            this.isRun = false;
            return;
        }
        const minValue = await this.coreContext.configsProvider.getByName(this.coreContext.blockTree, currentBlock.hash, currentBlock.height, 'min-bws-block');
        const balanceDTO = await this.coreContext.walletProvider.getWalletBalance(this.coreContext.blockTree, currentBlock.hash, mainWallet.address);
        if (balanceDTO.balance.isLessThan(new BigNumber(minValue.value))) {
            return;
        }

        const tx = new Tx();
        tx.version = '2';
        tx.chain = this.coreContext.chain;
        tx.from = [mainWallet.address];
        tx.to = [mainWallet.address];
        tx.amount = ['0'];
        tx.fee = '0';
        tx.type = TxType.TX_BLOCKCHAIN_COMMAND;
        tx.data = {
            name: 'vote-block',
            input: [currentBlock.hash, currentBlock.height]
        };
        tx.foreignKeys = [];
        tx.created = Math.floor(Date.now() / 1000);
        tx.hash = tx.toHash();
        tx.sign = [await mainWallet.signHash(tx.hash)];
        await this.coreContext.transactionsProvider.saveNewTransaction(tx);
        this.coreContext.applicationContext.logger.verbose(`create vote in ${currentBlock.height}`);

        this.makePOI(currentBlock);
    }

    async makePOI(block: Block) {
        if (block.chain === 'mainnet' || block.chain === 'testnet' || block.chain === 'local') {
            return;
        }
        const mainWallet = await this.coreContext.walletProvider.getMainWallet();

        const web3 = new Web3({
            initialNodes: ['https://node1.bywise.org'],
        })

        const tx = new Tx();
        tx.version = '2';
        tx.chain = 'mainnet';
        tx.from = [mainWallet.address];
        tx.to = [mainWallet.address];
        tx.amount = ['0'];
        tx.fee = '0';
        tx.type = TxType.TX_BLOCKCHAIN_COMMAND;
        tx.data = {
            name: 'poi',
            input: [block.height, block.chain, block.hash]
        };
        tx.foreignKeys = [];
        tx.created = Math.floor(Date.now() / 1000);
        tx.hash = tx.toHash();
        tx.sign = [await mainWallet.signHash(tx.hash)];

        await web3.network.tryConnection();
        try {
            await web3.transactions.sendTransactionSync(tx);
            this.coreContext.applicationContext.logger.verbose(`create poi in ${block.height} - hash: ${tx.hash}`);
        } catch (err: any) {
            this.coreContext.applicationContext.logger.error(`cant create poi in ${block.height} - error: ${err.message}`);
        }
    }
}
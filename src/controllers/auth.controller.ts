import express from 'express';
import metadataDocument from '../metadata/metadataDocument';
import { ApplicationContext } from '../types/task.type';
import helper from '../utils/helper';
import fs from 'fs';

const pidusage = require('pidusage');
const v8 = require('v8');

export default async function authController(app: express.Express, applicationContext: ApplicationContext): Promise<void> {

    const router = express.Router();

    metadataDocument.addPath({
        path: "/api/v2/auth/me",
        type: 'get',
        controller: 'AuthController',
        description: 'Create new account',
        responses: [{
            code: 200,
            description: 'Success',
            body: {
                type: 'object',
                properties: [
                    { name: 'message', type: 'string' },
                    { name: 'id', type: 'string', example: '632c6484947ba8178426866e' },
                    { name: 'type', type: 'string', enum: ['user', 'node', 'token'] },
                    { name: 'time', type: 'string', example: '2022-09-22T14:04:57.966Z' }
                ]
            },
        }]
    })
    router.get('/me', async (req: express.Request, res: express.Response) => {
        return res.send({
            message: 'OK',
            ...req.context,
            time: helper.getNow()
        });
    });

    metadataDocument.addPath({
        path: "/api/v2/auth/statistics",
        type: 'get',
        security: false,
        controller: 'AuthController',
        description: 'Create new account',
        parameters: [
            { name: 'token', in: 'query', pattern: /^[a-zA-Z0-9_]+$/ },
        ],
        responses: [{
            code: 200,
            description: 'Success',
            body: {
                type: 'object',
                properties: [
                    { name: 'message', type: 'string' },
                    { name: 'id', type: 'string', example: '632c6484947ba8178426866e' },
                    { name: 'type', type: 'string', enum: ['user', 'node', 'token'] },
                    { name: 'time', type: 'string', example: '2022-09-22T14:04:57.966Z' }
                ]
            },
        }]
    })
    router.get('/statistics', async (req: express.Request, res: express.Response) => {
        let token = `${req.query.token}`;
        if (token !== process.env.TOKEN) return res.status(400).send({ error: `Forbidden` });
        let done = false;

        const defaultResponse = {
            size: 0,
            cpu: 0,
            memory: 0,
            total_heap_size: 0,
            used_heap_size: 0,
            heap_size_limit: 0,
            timestamp: Date.now(),
        };

        const readDir = (path: string): number => {
            const dir = fs.readdirSync(path);
            let size = 0;
            for (let i = 0; i < dir.length; i++) {
                const file = dir[i];
                const fileLocation = `${path}/${file}`;

                const stat = fs.statSync(fileLocation);
                if (stat.isDirectory()) {
                    size += readDir(fileLocation)
                } else {
                    size += stat.size;
                }
            }
            return size;
        }

        pidusage(process.pid, (err: any, stat: any) => {
            if (err) {
                console.log(err);
                return;
            }
            const heap = v8.getHeapStatistics();

            defaultResponse.cpu = stat.cpu;
            defaultResponse.memory = stat.memory / 1024 / 1024;
            defaultResponse.total_heap_size = heap.total_heap_size / 1024 / 1024;
            defaultResponse.used_heap_size = heap.used_heap_size / 1024 / 1024;
            defaultResponse.heap_size_limit = heap.heap_size_limit / 1024 / 1024;
            defaultResponse.timestamp = Date.now();

            done = true;
        });
        defaultResponse.size = readDir('./data')
        while (!done) {
            await helper.sleep(100);
        }
        return res.send(defaultResponse);
    });

    app.use('/api/v2/auth', router);
}
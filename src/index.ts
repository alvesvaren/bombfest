import Koa from "koa";
import KoaRouter from "@koa/router";
import koaCors from "@koa/cors";
import koaStatic from "koa-static";
import koaLogger from "koa-logger";
import koaBody from "koa-body";
import koaWs from "koa-easy-ws";
import WebSocket from "ws";
import { GamePlayer, Player, Room, validateToken } from "./game";
import jwt from "jsonwebtoken";
import { RoomCreationData } from "./interfaces";
import { randomUUID } from "crypto";

const config = {
    port: 3000,
};

const app = new Koa();
const router = new KoaRouter();

const rooms: { [uuid: string]: Room } = {};

const currentPlayer = (ctx: Koa.Context) => {
    const token = ctx.request.header.authorization?.split(" ")[1];
    try {
        validateToken(token || "");
    } catch (error) {
        return null;
    }
    const data = jwt.decode(token || "", { json: true });
    if (data && data.sub && data.name) {
        return new Player(data.name, data.sub);
    }

    return null;
};

router.get("/", (ctx, next) => {
    ctx.body = { online: true };
});

router.get("/rooms", ctx => {
    ctx.body = Object.entries(rooms).map(([uuid, room]) => ({
        uuid: room.uuid,
        name: room.name,
        player_count: room.players.filter(p => p.connected).length,
    }));
});

router.post("/account", ctx => {
    const playerData: {
        name: string;
        uuid?: string;
    } = ctx.request.body;

    const player = new Player(playerData.name, playerData.uuid || randomUUID());

    ctx.body = {
        token: player.generateToken(),
    };
});

router.post("/rooms", ctx => {
    const data: RoomCreationData = ctx.request.body;

    if (currentPlayer(ctx)) {
        const room = new Room(data.name, data.isPrivate);
        rooms[room.uuid] = room;
        ctx.body = {
            uuid: room.uuid,
        };
    } else {
        ctx.body = { error: "Invalid authorization token" };
    }
});

router.get("/room/:id/ws", async (ctx, next) => {
    if (ctx.ws) {
        const ws: WebSocket = await ctx.ws();
        const queryAuth = (ctx.request.query["authorization"] || []) as string;
        const authorizationToken = ctx.request.header.authorization?.split(" ")[1] || queryAuth;
        if (!authorizationToken) {
            ws.close(1008, "No authorization token provided");
            ctx.status = 401;
            ctx.body = { error: "No authorization token provided" };
            return;
        }
        const room = rooms[ctx.params.id || ""];
        if (!room) {
            ws.close(1008, "Room not found");
            ctx.status = 404;
            ctx.body = { error: "Room not found" };
            return;
        }
        const data = jwt.decode(authorizationToken, { json: true });
        if (data && data.name && data.sub) {
            const oldPlayer = room.players.find(player => player.uuid === data.sub);
            if (oldPlayer) {
                oldPlayer.socket.close(1008, "Connected from other location");
                oldPlayer.socket = ws;
                oldPlayer.connected = true;
            } else {
                new GamePlayer(data.name, room, ws, data.sub, room.players.length === 0);
            }
        }
    }
});

app.use(koaLogger());
app.use(koaCors());
app.use(koaBody());
app.use(koaStatic(__dirname + "/public"));
app.use(koaWs());
app.use(router.routes());
app.use(router.allowedMethods());

app.listen(config.port, () => {
    console.log(`Server listening on *:3000, see http://127.0.0.1:${config.port}`);
});

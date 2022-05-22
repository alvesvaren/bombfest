import Koa from "koa";
import KoaRouter from "@koa/router";
import koaCors from "@koa/cors";
// import koaStatic from "koa-static";
import koaLogger from "koa-logger";
import koaBody from "koa-body";
import koaWs from "koa-easy-ws";
import WebSocket from "ws";
import { GamePlayer, Player, Room, validateToken } from "./game";
import jwt from "jsonwebtoken";
import { CloseReason, RoomCreationData, RoomData } from "./interfaces";
import generateCuid from "cuid";
import process from "process";

const config = {
    port: process.env.SERVER_PORT || 3001,
};

const app = new Koa();
const router = new KoaRouter({ prefix: "/api" });

const rooms: { [cuid: string]: Room } = {};

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
    (ctx.body as RoomData[]) = Object.entries(rooms).map(([cuid, room]) => ({
        cuid: room.cuid,
        name: room.name,
        player_count: room.players.filter(p => p.connected).length,
        language: room.language,
    }));
});

router.post("/account", ctx => {
    const playerData: {
        name: string;
        cuid?: string;
    } = ctx.request.body;

    if (!playerData.name) {
        ctx.status = 400;
        ctx.body = { error: "Invalid name" };
        return;
    }

    if (playerData.name.length > 20) {
        ctx.status = 400;
        ctx.body = { error: "Name too long" };
        return;
    }

    const player = new Player(playerData.name, playerData.cuid || generateCuid());

    ctx.body = {
        token: player.generateToken(),
    };
});

router.post("/rooms", ctx => {
    const data: RoomCreationData = ctx.request.body;

    if (data.name.length > 20) {
        ctx.status = 400;
        ctx.body = { error: "Name too long" };
        return;
    }

    if (!data.name.length) {
        ctx.status = 400;
        ctx.body = { error: "Name required" };
        return;
    }

    if (currentPlayer(ctx)) {
        const room = new Room(data.name, data.isPrivate);
        rooms[room.cuid] = room;
        (ctx.body as RoomData) = {
            cuid: room.cuid,
            name: room.name,
            language: room.language,
            player_count: room.playerCount,
        };
    } else {
        ctx.status = 401;
        ctx.body = { error: "Invalid authorization token" };
    }
});

router.get("/room/:id/ws", async (ctx, next) => {
    if (ctx.ws) {
        const ws: WebSocket = await ctx.ws();
        const queryAuth = (ctx.request.query["authorization"] || []) as string;
        const authorizationToken = ctx.request.header.authorization?.split(" ")[1] || queryAuth;
        if (!authorizationToken) {
            ws.close(CloseReason.InvalidAuthorizationToken, "No authorization token provided");
            ctx.status = 401;
            ctx.body = { error: "No authorization token provided" };
            return;
        }
        const room = rooms[ctx.params.id || ""];
        if (!room) {
            ws.close(CloseReason.NotFound, "Room not found");
            ctx.status = 404;
            ctx.body = { error: "Room not found" };
            return;
        }
        const data = jwt.decode(authorizationToken, { json: true });
        if (data && data.name && data.sub) {
            const player = room.players.find(player => player.cuid === data.sub);
            if (player) {
                player.socket.close(CloseReason.ConnectedFromElsewhere, "Connected from other location");
                player.socket = ws;
                player.initiatePlayer();
            } else {
                new GamePlayer(data.name, room, ws, data.sub, room.players.length === 0);
            }
        }
    }

    ctx.status = 204;
});

app.use(koaLogger());
app.use(koaCors());
app.use(koaBody());
// app.use(koaStatic(__dirname + "/public"));
app.use(koaWs());
app.use(router.routes());
app.use(router.allowedMethods());

app.listen(config.port, () => {
    console.log(`Server listening on 0.0.0.0:${config.port}, see http://127.0.0.1:${config.port}`);
});

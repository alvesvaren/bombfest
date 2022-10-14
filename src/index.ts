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
import { CloseReason, defaultRules, RoomCreationData, RoomData } from "./interfaces";
import generateCuid from "cuid";
import process from "process";
import { z } from "zod";

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

router.get("/", ctx => {
    ctx.body = { online: true };
});

router.get("/rooms", ctx => {
    ctx.body = Object.values(rooms)
        .map(room =>
            room.isPrivate
                ? undefined
                : {
                      cuid: room.cuid,
                      name: room.name,
                      player_count: room.players.filter(p => p.connected).length,
                      language: room.language,
                  }
        )
        .filter(room => room !== undefined) as RoomData[];
});

const accountSchema = z.object({
    name: z.string().max(20, "Name too long").min(1, "Name too short"),
    cuid: z.string().cuid().optional(),
});

router.post("/account", ctx => {
    const zRes = accountSchema.safeParse(ctx.request.body);

    if (!zRes.success) {
        ctx.status = 400;
        ctx.body = { errors: zRes.error.flatten().fieldErrors };
        return;
    }

    const playerData = zRes.data;

    const player = new Player(playerData.name, playerData.cuid || generateCuid());

    ctx.body = {
        token: player.generateToken(),
    };
});

const roomSchema = z.object({
    name: z.string().max(20, "Name too short").min(1, "Name required"),
    isPrivate: z.boolean(),
    lang: z.literal("en_US").or(z.literal("sv_SE")),
    rules: z
        .object({
            minWordsPerPrompt: z
                .number()
                .min(0, "WPP too low")
                .default(defaultRules.minWordsPerPrompt || 0),
            maxWordsPerPrompt: z
                .number()
                .min(1, "WPP too low")
                .nullable()
                .default(defaultRules.maxWordsPerPrompt || null)
                .transform(v => (v === null ? undefined : v)),
            minRoundTimer: z.number().min(1, "Min round timer too short"),
            minNewBombTimer: z.number().min(1, "Bomb timer too low"),
            maxNewBombTimer: z.number().min(1, "Bomb timer too low"),
            startingLives: z.number().min(1, "Starting lives too low"),
            maxLives: z.number().min(1, "Max lives too low"),
        })
        .refine(data => data.minWordsPerPrompt < (data.maxWordsPerPrompt || Infinity), { message: "Min WPP must be lower than max" })
        .refine(data => data.minNewBombTimer < data.maxNewBombTimer, { message: "Min bomb timer must be lower than max" })
        .refine(data => data.startingLives < data.maxLives, { message: "Starting lives must be lower than max" }),
});

router.post("/rooms", ctx => {
    const zRes = roomSchema.safeParse(ctx.request.body);

    if (!zRes.success) {
        ctx.status = 400;
        ctx.body = { errors: zRes.error.flatten().fieldErrors };
        return;
    }

    const { data } = zRes;

    if (currentPlayer(ctx)) {
        const room = new Room(data);
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
        const queryAuth = (ctx.request.query["authorization"] || "") as string;
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

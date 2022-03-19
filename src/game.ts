import { jwtSecret } from "./secrets.json";
import jwt from "jsonwebtoken";
import WebSocket from "ws";
import { BaseEvent, GameBroadcastEvent, GameEvent, nonce, PlayerData, Rules, uuid } from "./interfaces";
import { randomUUID } from "crypto";

export const validateToken = (token: string) => {
    return jwt.verify(token, jwtSecret);
};

export class Player {
    uuid: string;
    name: string;
    constructor(name: string, uuid: uuid) {
        this.uuid = uuid;
        this.name = name;
    }

    generateToken() {
        return jwt.sign({ sub: this.uuid, name: this.name, iat: Math.floor(new Date().getTime() / 1000) }, jwtSecret);
    }

    static fromToken(token: string) {
        const data = jwt.decode(token, { json: true });
        if (data && data.sub && data.name) {
            return new Player(data.name, data.sub);
        }
        return null;
    }
}

export class GamePlayer extends Player {
    text: string = "";
    connected: boolean = true;
    socket: WebSocket;
    room: Room;
    admin: boolean;

    constructor(name: string, room: Room, socket: WebSocket, uuid: string, admin: boolean) {
        super(name, uuid);
        this.room = room;
        this.socket = socket;
        this.admin = admin;
        this.initiatePlayer();
        this.room.addPlayer(this);
    }

    initiatePlayer() {
        this.connected = true;
        this.socket.on("message", this.handleSocketMessage.bind(this));
        console.log(`Player ${this.name} connected`);
        this.socket.on("close", () => {
            this.connected = false;
            console.log(`Player ${this.name} disconnected`);
        });
        this.send("state", {
            currentPlayer: this.room.currentPlayer?.uuid,
            prompt: this.room.prompt,
            players: this.room.players.map(player => player.objectify()),
            rules: this.room.rules,
        });

    }

    send<T extends GameEvent | GameBroadcastEvent>(type: T["type"], data: T["data"], nonce?: nonce) {
        if (this.socket) {
            this.socket.send(JSON.stringify({ type, data, nonce }));
        }
    }

    objectify(): PlayerData {
        return {
            uuid: this.uuid,
            name: this.name,
            text: this.text,
            connected: this.connected,
        };
    }

    handleSocketMessage(message: string) {
        try {
            const data: GameEvent = JSON.parse(message);
            switch (data.type) {
                case "chat":
                    this.room.broadcast("chat", { text: data.data.text, from: this.uuid });
                    break;
                case "text":
                    this.text = data.data.text;
                    break;
                case "ping":
                    this.send("pong", undefined, data.nonce);
                    break;
            }
        } catch (e) {
            console.error(e);
        }
    }
}

export class Room {
    uuid: string;
    name: string;
    players: GamePlayer[];
    currentPlayer: Player | null = null;
    isPrivate: boolean;
    prompt: string | null = null;
    rules: Rules = {
        maxNewBombTimer: 30,
        minNewBombTimer: 10,
        minRoundTimer: 5,
        minWordsPerPrompt: 500,
        maxWordsPerPrompt: undefined,
    };

    constructor(name: string, isPrivate: boolean = false) {
        this.uuid = randomUUID();
        this.isPrivate = isPrivate;
        this.name = name;
        this.players = [];
    }

    addPlayer(player: GamePlayer) {
        this.players.push(player);
        this.broadcast("join", { uuid: player.uuid, name: player.name });
    }

    removePlayer(player: GamePlayer) {
        this.players = this.players.filter(p => p !== player);
        this.broadcast("leave", { uuid: player.uuid });
    }

    broadcast(type: GameBroadcastEvent["type"], data: GameBroadcastEvent["data"]) {
        this.players.forEach(player => {
            player.send(type, data);
        });
    }

    sendChat(from: GamePlayer, text: string) {
        this.broadcast("chat", { from: from.uuid, text });
    }
}

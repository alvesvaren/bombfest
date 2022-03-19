import { jwtSecret } from "./secrets.json";
import jwt from "jsonwebtoken";
import WebSocket from "ws";
import { BaseEvent, DictionaryName, GameBroadcastEvent, GameEvent, GameStateEvent, nonce, PlayerData, Rules, uuid } from "./interfaces";
import { randomUUID } from "crypto";
import { checkValid, getRandomPrompt } from "./wordmanager";

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
    alive: boolean = true;
    admin: boolean;
    lives: number = 0;

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
        this.lives = this.room.rules.startingLives;
        this.socket.on("message", this.handleSocketMessage.bind(this));
        console.log(`Player ${this.name} connected`);
        this.socket.on("close", () => {
            this.connected = false;
            console.log(`Player ${this.name} disconnected`);
        });
        this.send("state", this.room.objectify());
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
            alive: this.alive,
        };
    }

    handleSocketMessage(message: string) {
        try {
            const data: GameEvent = JSON.parse(message);
            switch (data.type) {
                case "chat":
                    this.room.broadcast("chat", { text: data.data.text, from: this.uuid });
                    (async () => {
                        console.log(`The word ${data.data.text} is ${(await checkValid(data.data.text, "sv_SE")) ? "" : "not "}a valid swedish word`);
                    })();
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
    players: GamePlayer[] = [];
    playingPlayers: GamePlayer[] = [];
    currentPlayerIndex: number = 0;
    isPrivate: boolean;
    language: DictionaryName = "sv_SE";
    prompt: string | null = null;
    roundTimer?: NodeJS.Timeout;
    rules: Rules = {
        maxNewBombTimer: 30,
        minNewBombTimer: 10,
        minRoundTimer: 5,
        minWordsPerPrompt: 500,
        maxWordsPerPrompt: undefined,
        startingLives: 2,
        maxLives: 3,
    };

    constructor(name: string, isPrivate: boolean = false) {
        this.uuid = randomUUID();
        this.isPrivate = isPrivate;
        this.name = name;
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

    objectify(): GameStateEvent["data"] {
        return {
            players: this.players.map(player => player.objectify()),
            playingPlayers: this.playingPlayers.map(player => player.uuid),
            currentPlayerIndex: this.currentPlayerIndex,
            language: this.language,
            prompt: this.prompt,
            rules: this.rules,
        };
    }

    sendChat(from: GamePlayer, text: string) {
        this.broadcast("chat", { from: from.uuid, text, at: Math.floor(new Date().getTime() / 1000) });
    }

    startGame() {
        this.playingPlayers = this.players.filter(player => player.connected);
        this.playingPlayers.forEach(player => {
            player.lives = this.rules.startingLives;
            player.text = "";
            player.alive = true;
        });
        this.currentPlayerIndex = 0;
        this.broadcast("state", this.objectify());
        this.nextPrompt();
    }

    startRoundTimer() {
        length = Math.ceil(Math.random() * (this.rules.maxNewBombTimer - this.rules.minNewBombTimer)) + this.rules.minNewBombTimer;
        if (length < this.rules.minRoundTimer) {
            length = this.rules.minRoundTimer;
        }
        this.roundTimer = setTimeout(() => {
            this.nextPrompt();
            this.getCurrentPlayer().lives -= 1;
            this.broadcast("damage", { player: this.getCurrentPlayer().uuid, lives: this.getCurrentPlayer().lives });
        }, length);
    }

    getCurrentPlayer() {
        return this.playingPlayers[this.currentPlayerIndex % this.playingPlayers.length] as GamePlayer;
    }

    nextPrompt() {
        this.prompt = getRandomPrompt(this.language, this.rules) || null;
        this.currentPlayerIndex += 1;
        this.broadcast("state", this.objectify());
        this.startRoundTimer();
    }
}

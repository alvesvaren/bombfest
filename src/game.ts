import { jwtSecret } from "./secrets.json";
import jwt from "jsonwebtoken";
import WebSocket from "ws";
import { BaseEvent, defaultRules, DictionaryName, GameBroadcastEvent, GameEvent, GameStateEvent, nonce, PlayerData, Rules, uuid } from "./interfaces";
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
        this.socket.on("message", this.handleSocketMessage.bind(this));
        console.log(`Player ${this.name} connected`);
        this.room.broadcastState();
        this.socket.on("close", () => {
            this.connected = false;
            console.log(`Player ${this.name} disconnected`);
            this.room.broadcastState();
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
            lives: this.lives,
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
                    this.room.broadcast("text", { text: data.data.text, from: this.uuid });
                    break;
                case "ping":
                    this.send("pong", undefined, data.nonce);
                    break;
                case "play":
                    this.room.addPlayingPlayer(this);
                    break;
                case "submit":
                    this.room.submitWord(this, data.data.text);
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
    startTimer?: NodeJS.Timeout;
    rules: Rules = defaultRules;

    constructor(name: string, isPrivate: boolean = false) {
        this.uuid = randomUUID();
        this.isPrivate = isPrivate;
        this.name = name;
    }

    addPlayer(player: GamePlayer) {
        this.players.push(player);
        this.broadcast("join", { uuid: player.uuid, name: player.name });
    }

    addPlayingPlayer(player: GamePlayer) {
        if (this.playingPlayers.find(p => p.uuid === player.uuid)) {
            return;
        }
        this.playingPlayers.unshift(player);
        this.broadcastState();

        if (this.playingPlayers.length >= 2) {
            this.startGame();
        }
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

    broadcastState() {
        this.broadcast("state", this.objectify());
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
        this.broadcast("chat", { from: from.uuid, text, at: Math.floor(new Date().getTime()) });
    }

    startGame() {
        this.playingPlayers = this.players.filter(player => player.connected);
        this.playingPlayers.forEach(player => {
            player.lives = this.rules.startingLives;
            player.text = "";
            player.alive = true;
        });
        this.currentPlayerIndex = 0;
        this.broadcastState();
        this.broadcast("start", { at: Math.floor(new Date().getTime()) + 15000 });
        this.startTimer = setTimeout(() => {
            this.nextPrompt();
        }, 15000);
    }

    async submitWord(from: GamePlayer, word: string) {
        word = word.toLowerCase();
        if (this.prompt && !word.includes(this.prompt)) {
            this.broadcast("incorrect", { for: from.uuid });
        }

        const isCorrect = await checkValid(word, this.language);
        
        if (isCorrect) {
            this.passBomb(from);
        } else {
            this.broadcast("incorrect", { for: from.uuid });
        }
    }

    passBomb(from: GamePlayer) {
        this.broadcast("correct", { for: from.uuid });
        this.nextPrompt();
    }

    startBombTimer() {
        let length = Math.ceil(Math.random() * (this.rules.maxNewBombTimer - this.rules.minNewBombTimer)) + this.rules.minNewBombTimer;
        if (length < this.rules.minRoundTimer) {
            length = this.rules.minRoundTimer;
        }
        console.log(length);
        if (this.roundTimer) {
            clearTimeout(this.roundTimer);
        }
        this.roundTimer = setTimeout(() => {
            const currentPlayer = this.getCurrentPlayer();
            if (currentPlayer) {
                currentPlayer.lives -= 1;
                if (currentPlayer.lives <= 0) {
                    currentPlayer.alive = false;
                }
                this.broadcast("damage", { player: currentPlayer.uuid, lives: currentPlayer.lives });
            }
            this.nextPrompt();
        }, length * 1000);
    }

    getCurrentPlayer() {
        const realPlayingPlayers = this.playingPlayers.filter(player => player.alive);
        return realPlayingPlayers[this.currentPlayerIndex % realPlayingPlayers.length];
    }

    nextPrompt() {
        this.prompt = getRandomPrompt(this.language, this.rules) || null;
        this.currentPlayerIndex += 1;
        this.broadcastState();
        this.startBombTimer();
    }
}

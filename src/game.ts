import { jwtSecret } from "./secrets.json";
import jwt from "jsonwebtoken";
import WebSocket from "ws";
import { BaseEvent, defaultRules, DictionaryName, GameBroadcastEvent, GameEvent, GameStateEvent, nonce, PlayerData, Rules, cuid } from "./interfaces";
import generateCuid from "cuid";
import { checkValid, getRandomPrompt } from "./wordmanager";

export const validateToken = (token: string) => {
    return jwt.verify(token, jwtSecret);
};

export class Player {
    cuid: string;
    name: string;
    constructor(name: string, cuid: cuid) {
        this.cuid = cuid;
        this.name = name;
    }

    generateToken() {
        return jwt.sign({ sub: this.cuid, name: this.name, iat: Math.floor(new Date().getTime() / 1000) }, jwtSecret);
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
    lives: number = 0;

    constructor(name: string, room: Room, socket: WebSocket, cuid: string, admin: boolean) {
        super(name, cuid);
        this.room = room;
        this.socket = socket;
        this.admin = admin;
        this.initiatePlayer();
        this.room.addPlayer(this);
    }

    get alive() {
        return this.lives > 0;
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
            cuid: this.cuid,
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
                    this.room.broadcast("chat", { text: data.data.text, from: this.cuid });
                    break;
                case "text":
                    this.text = data.data.text;
                    if (this.room.getCurrentPlayer() === this) {
                        this.room.broadcast("text", { text: data.data.text, from: this.cuid });
                    }
                    break;
                case "ping":
                    this.send("pong", undefined, data.nonce);
                    break;
                case "play":
                    if (!this.room.isPlaying) {
                        this.room.addPlayingPlayer(this);
                    }
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
    cuid: string;
    name: string;
    players: GamePlayer[] = [];
    playingPlayers: GamePlayer[] = [];
    currentPlayerIndex: number = 0;
    isPrivate: boolean;
    isPlaying: boolean = false;
    language: DictionaryName = "sv_SE";
    prompt: string | null = null;
    roundTimer?: NodeJS.Timeout;
    startTimer?: NodeJS.Timeout;
    bombExplodesAt?: number;
    rules: Rules = defaultRules;

    constructor(name: string, isPrivate: boolean = false) {
        this.cuid = generateCuid();
        this.isPrivate = isPrivate;
        this.name = name;
    }

    get bombExplodesIn() {
        return this.bombExplodesAt ? this.bombExplodesAt - new Date().getTime() : null;
    }

    addPlayer(player: GamePlayer) {
        this.players.push(player);
        this.broadcast("join", { cuid: player.cuid, name: player.name });
    }

    addPlayingPlayer(player: GamePlayer) {
        if (this.playingPlayers.find(p => p.cuid === player.cuid)) {
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
        this.broadcast("leave", { cuid: player.cuid });
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
            playingPlayers: this.playingPlayers.map(player => player.cuid),
            currentPlayerIndex: this.currentPlayerIndex,
            language: this.language,
            prompt: this.prompt,
            rules: this.rules,
            bombExplodesIn: this.bombExplodesIn,
        };
    }

    sendChat(from: GamePlayer, text: string) {
        this.broadcast("chat", { from: from.cuid, text, at: Math.floor(new Date().getTime()) });
    }

    startGame() {
        this.playingPlayers = this.players.filter(player => player.connected);
        this.isPlaying = true;
        this.playingPlayers.forEach(player => {
            player.lives = this.rules.startingLives;
            player.text = "";
        });
        this.currentPlayerIndex = 0;
        this.broadcastState();
        this.broadcast("start", { in: 10000 });
        this.startTimer = setTimeout(() => {
            this.nextPrompt();
            this.resetBombTimer();
        }, 10000);
    }

    async submitWord(from: GamePlayer, word: string) {
        word = word.toLowerCase();
        if (this.prompt && !word.includes(this.prompt)) {
            this.broadcast("incorrect", { for: from.cuid });
            return;
        }

        const isCorrect = await checkValid(word, this.language);

        if (isCorrect) {
            this.passBomb(from);
        } else {
            this.broadcast("incorrect", { for: from.cuid });
        }
    }

    passBomb(from: GamePlayer) {
        this.broadcast("correct", { for: from.cuid });
        this.nextPrompt();
    }

    passPrompt() {
        this.nextPlayer();
        this.resetBombTimer();
        this.broadcastState();
    }

    resetBombTimer() {
        let length = Math.ceil(Math.random() * (this.rules.maxNewBombTimer - this.rules.minNewBombTimer)) + this.rules.minNewBombTimer;
        // if (length < this.rules.minRoundTimer) {
        //     length = this.rules.minRoundTimer;
        // }
        console.log(length);
        this.setBombTimer(length * 1000);
    }

    setBombTimer(time: number) {
        if (this.roundTimer) {
            clearTimeout(this.roundTimer);
        }

        this.roundTimer = setTimeout(() => {
            const currentPlayer = this.getCurrentPlayer();
            if (currentPlayer) {
                currentPlayer.lives -= 1;
                this.broadcast("damage", { player: currentPlayer.cuid, lives: currentPlayer.lives });
            }
            this.passPrompt();
        }, time);
        this.bombExplodesAt = Math.floor(new Date().getTime()) + time * 1000;
    }

    nextPlayer() {
        const playingPlayers = this.playingPlayers.filter(player => player.alive);
        do {
            this.currentPlayerIndex += 1;
        } while (this.getCurrentPlayer() && this.getCurrentPlayer()?.alive === false && playingPlayers.length >= 1);
    }

    getCurrentPlayer() {
        const currentPlayer = this.playingPlayers[this.currentPlayerIndex % this.playingPlayers.length];
        if (!currentPlayer?.alive) {
            return null;
        }
        return currentPlayer || null;
    }

    nextPrompt() {
        if (this.bombExplodesAt && this.bombExplodesAt > new Date().getTime() + this.rules.minRoundTimer * 1000) {
            this.setBombTimer(this.rules.minNewBombTimer * 1000);
        }
        this.prompt = getRandomPrompt(this.language, this.rules) || null;
        this.nextPlayer();
        this.broadcastState();
    }
}

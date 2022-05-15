import { jwtSecret } from "./secrets.json";
import jwt from "jsonwebtoken";
import WebSocket from "ws";
import { BaseEvent, defaultRules, DictionaryName, GameBroadcastEvent, GameEvent, GameStateEvent, nonce, PlayerData, Rules, cuid } from "./interfaces";
import generateCuid from "cuid";
import { checkValid, getRandomPrompt } from "./wordmanager";

export const validateToken = (token: string) => {
    return jwt.verify(token, jwtSecret);
};

export const sleep = async (duration: number) => await new Promise<void>(resolve => setTimeout(resolve, duration));

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

    get isMyTurn(): boolean {
        return this.room.currentPlayer === this && this.alive;
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
        if (!this.connected) {
            this.send("error", { msg: "You are not connected" });
            return;
        }

        try {
            const data: GameEvent = JSON.parse(message);
            switch (data.type) {
                case "chat":
                    if (data.data.text.length > 256) {
                        this.send("error", { message: "Your message is too long" });
                        return;
                    }
                    this.room.sendChat(this, data.data.text);
                    break;
                case "text":
                    if (this.isMyTurn) {
                        this.text = data.data.text.toLowerCase();
                        if (this.text.length > 256) {
                            this.send("error", { message: "Your word is too long" });
                            return;
                        }
                        this.room.broadcast("text", { text: this.text, from: this.cuid });
                    }
                    break;
                case "ping":
                    this.send("pong", undefined, data.nonce);
                    break;
                case "play":
                    if (!this.room.isPlaying) {
                        this.room.addPlayingPlayer(this);
                    } else {
                        this.send("error", { message: "Game is already in progress" });
                    }
                    break;
                case "submit":
                    if (this.isMyTurn) {
                        this.text = data.data.text.toLowerCase();
                        if (this.text.length > 256) {
                            this.send("error", { message: "Your word is too long" });
                            return;
                        }
                        this.room.broadcast("text", { text: this.text, from: this.cuid });
                        this.room.submitAttempt(data.data.text.toLowerCase());
                    }
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
    isPrivate: boolean;
    isPlaying: boolean = false;
    language: DictionaryName = "sv_SE";
    prompt: string | null = null;
    bombTimer?: NodeJS.Timeout;
    startTimer?: NodeJS.Timeout;
    bombExplodesAt?: number;
    rules: Rules = defaultRules;
    currentPlayer: GamePlayer | null = null;
    startWaitTime = 10000;
    submitAttempt: (word: string) => void = () => {};

    constructor(name: string, isPrivate: boolean = false) {
        this.cuid = generateCuid();
        this.isPrivate = isPrivate;
        this.name = name;

        this.startGameLoop();
    }

    get bombExplodesIn() {
        return this.bombExplodesAt ? this.bombExplodesAt - new Date().getTime() : null;
    }

    get playerCount() {
        return this.players.filter(p => p.connected).length;
    }

    async waitForPlayersToJoin() {
        while (this.playingPlayers.length < 2) await sleep(100);
        this.broadcast("start", { in: this.startWaitTime });
        await sleep(this.startWaitTime);
    }

    async waitForPlayerToSubmitCorrect(player: GamePlayer, length: number) {
        return new Promise<boolean>(resolve => {
            this.submitAttempt = word => {
                if (this.prompt && word.includes(this.prompt)) {
                    checkValid(word, this.language).then(isValid => {
                        if (isValid) {
                            this.broadcast("correct", { for: player.cuid });
                            if (this.bombTimer) clearTimeout(this.bombTimer);
                            resolve(true);
                        } else this.broadcast("incorrect", { for: player.cuid });
                    });
                } else this.broadcast("incorrect", { for: player.cuid });
            };

            this.bombTimer = setTimeout(() => {
                player.lives -= 1;
                this.broadcast("damage", { for: player.cuid, lives: player.lives });
                resolve(false);
            }, length);
        });
    }

    *genPlayers() {
        let playerIndex = -1;
        while (true) {
            do {
                playerIndex += 1;
            } while (!this.playingPlayers[playerIndex % this.playingPlayers.length]?.alive);
            yield this.playingPlayers[playerIndex % this.playingPlayers.length];
        }
    }

    newPrompt() {
        this.prompt = getRandomPrompt(this.language, this.rules) || null;
    }

    newBombTimer() {
        const length = Math.ceil(Math.random() * (this.rules.maxNewBombTimer - this.rules.minNewBombTimer)) + this.rules.minNewBombTimer;
        this.bombExplodesAt = new Date().getTime() + length * 1000;
    }

    renewBombTimer() {
        if ((this.bombExplodesIn || 0) < this.rules.minRoundTimer * 1000) {
            this.bombExplodesAt = new Date().getTime() + this.rules.minRoundTimer * 1000;
        }
    }

    async gameLoop() {
        this.broadcastState();
        await this.waitForPlayersToJoin();
        this.startGame();
        const players = this.genPlayers();

        this.newBombTimer();

        while (this.alivePlayingPlayers.length > 1) {
            // Handle one player's turn, elal is pog1
            const generatedPlayer = players.next();
            if (generatedPlayer.done || !generatedPlayer.value) {
                break;
            }
            this.currentPlayer = generatedPlayer.value;
            this.broadcastState();

            if (await this.waitForPlayerToSubmitCorrect(this.currentPlayer, this.bombExplodesIn || this.rules.minRoundTimer * 1000)) {
                this.broadcast("correct", { for: this.currentPlayer.cuid });
                this.newPrompt();
                this.renewBombTimer();
                this.broadcastState();
            } else {
                this.newBombTimer();
                this.broadcastState();
            }
        }
        this.endGame();
    }

    async startGameLoop() {
        while (true) {
            await this.gameLoop();
        }
    }

    addPlayer(player: GamePlayer) {
        this.players.push(player);
        this.broadcast("join", { cuid: player.cuid, name: player.name });
    }

    addPlayingPlayer(player: GamePlayer) {
        if (this.playingPlayers.find(p => p.cuid === player.cuid)) {
            return;
        }
        this.playingPlayers.push(player);
        this.broadcastState();
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
            isPlaying: this.isPlaying,
            playingPlayers: this.playingPlayers.map(player => player.cuid),
            currentPlayer: this.currentPlayer?.cuid || null,
            language: this.language,
            prompt: this.prompt,
            rules: this.rules,
            bombExplodesIn: this.bombExplodesIn,
        };
    }

    sendChat(from: GamePlayer, text: string) {
        this.broadcast("chat", { from: from.cuid, text, at: new Date().getTime() });
    }

    startGame() {
        this.isPlaying = true;
        this.playingPlayers.forEach(player => {
            player.lives = this.rules.startingLives;
            player.text = "";
        });
        this.currentPlayer = null;
        this.broadcastState();
        this.newPrompt();
    }

    async endGame() {
        this.broadcast("end", { winner: this.alivePlayingPlayers[0]?.cuid, newRoundIn: 2000 });
        await sleep(2000);
        this.playingPlayers = [];
        this.prompt = null;
        this.isPlaying = false;
        this.broadcastState();
    }

    get alivePlayingPlayers() {
        return this.playingPlayers.filter(player => player.alive);
    }
}

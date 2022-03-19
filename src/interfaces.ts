export const dicts = ["sv_SE", "en_US"] as const;

export type DictionaryName = typeof dicts[number];

export interface PlayerData {
    uuid: string;
    name: string;
    text: string;
    connected: boolean;
    alive: boolean;
}

export type uuid = string;
export type nonce = number | string;

export interface Rules {
    minWordsPerPrompt?: number;
    maxWordsPerPrompt?: number;
    minRoundTimer: number;
    minNewBombTimer: number;
    maxNewBombTimer: number;
    startingLives: number;
    maxLives: number;
}

export interface BaseEvent {
    type: string;
    data?: any;
    nonce?: nonce;
}

export interface ChatEvent extends BaseEvent {
    type: "chat";
    data: {
        text: string;
    };
}

export interface ChatBroadcastEvent extends BaseEvent {
    type: "chat";
    data: {
        text: string;
        from: uuid;
        at: number;
    };
}

export interface JoinBroadcastEvent extends BaseEvent {
    type: "join";
    data: PlayerData;
}

export interface LeaveBroadcastEvent extends BaseEvent {
    type: "leave";
    data: Pick<PlayerData, "uuid">;
}

export interface RoundEvent extends BaseEvent {
    type: "round";
    data: {
        prompt: string;
    };
}

export interface TextEvent extends BaseEvent {
    type: "text";
    data: {
        text: string;
    };
}

export interface StartBroadcastEvent extends BaseEvent {
    type: "start";
    data: {
        at: number;
    };
}

export interface RuleEvent extends BaseEvent {
    type: "rules";
    data: Rules;
}

export interface PingEvent extends BaseEvent {
    type: "ping";
}

export interface PongEvent extends BaseEvent {
    type: "pong";
}

export interface GameStateEvent extends BaseEvent {
    type: "state";
    data: {
        prompt: string | null;
        players: PlayerData[];
        playingPlayers: uuid[];
        currentPlayerIndex: number;
        rules: Rules;
        language: DictionaryName;
    };
}

export interface DamageBroadcastEvent extends BaseEvent {
    type: "damage";
    data: {
        lives: number;
        player: uuid;
    };
}

export interface PlayEvent extends BaseEvent {
    type: "play";
    data: {};
}

export interface ConnectBroadcastEvent extends BaseEvent {
    type: "connect";
    data: {
        player: string;
    };
}

export interface DisconnectBroadcastEvent extends BaseEvent {
    type: "disconnect";
    data: {
        player: string;
    };
}

export interface TextBroadcastEvent extends BaseEvent {
    type: "text";
    data: {
        text: string;
        from: uuid;
    };
}

export type GameBroadcastEvent =
    | TextBroadcastEvent
    | ChatBroadcastEvent
    | JoinBroadcastEvent
    | LeaveBroadcastEvent
    | DamageBroadcastEvent
    | GameStateEvent
    | StartBroadcastEvent
    | DisconnectBroadcastEvent
    | ConnectBroadcastEvent;
export type GameEvent = ChatEvent | RoundEvent | TextEvent | PingEvent | RuleEvent | GameStateEvent | PongEvent | PlayEvent;

export interface RoomCreationData {
    name: string;
    isPrivate: boolean;
}

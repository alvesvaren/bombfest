export const dicts = ["sv_SE", "en_US"] as const;

export type DictionaryName = typeof dicts[number];

export const defaultRules: Rules = {
    maxNewBombTimer: 30,
    minNewBombTimer: 10,
    minRoundTimer: 5,
    minWordsPerPrompt: 500,
    maxWordsPerPrompt: undefined,
    startingLives: 3,
    maxLives: 4,
};

export interface TokenData {
    sub: uuid;
    name: string;
    iat: number;
}

export interface PlayerData {
    uuid: string;
    name: string;
    text: string;
    connected: boolean;
    alive: boolean;
    lives: number;
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
        in: number;
    };
}

export interface RuleEvent extends BaseEvent {
    type: "rules";
    data: Rules;
}

export interface PingEvent extends BaseEvent {
    type: "ping";
}

export interface SubmitEvent extends BaseEvent {
    type: "submit";
}

export interface PongEvent extends BaseEvent {
    type: "pong";
}

export interface BaseGameState {
    prompt: string | null;
    players: PlayerData[];
    playingPlayers: uuid[];
    currentPlayerIndex: number;
    rules: Rules;
    language: DictionaryName;
    bombExplodesIn: number | null;
}

export interface GameStateEvent extends BaseEvent {
    type: "state";
    data: BaseGameState;
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

export interface TextBroadcastEvent extends BaseEvent {
    type: "text";
    data: {
        text: string;
        from: uuid;
    };
}

export interface IncorrectBroadcastEvent extends BaseEvent {
    type: "incorrect";
    data: {
        for: uuid;
    };
}

export interface CorrectBroadcastEvent extends BaseEvent {
    type: "correct";
    data: {
        for: uuid;
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
    | IncorrectBroadcastEvent
    | CorrectBroadcastEvent;
export type GameEvent = ChatEvent | RoundEvent | TextEvent | PingEvent | RuleEvent | GameStateEvent | PongEvent | PlayEvent | SubmitEvent;

export interface RoomCreationData {
    name: string;
    isPrivate: boolean;
}

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
    sub: cuid;
    name: string;
    iat: number;
}

export interface PlayerData {
    cuid: string;
    name: string;
    text: string;
    connected: boolean;
    alive: boolean;
    lives: number;
}

export type cuid = string;
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

export interface ChatMessage {
    text: string;
    from: cuid;
    at: number;
}

export interface ChatBroadcastEvent extends BaseEvent {
    type: "chat";
    data: ChatMessage;
}

export interface JoinBroadcastEvent extends BaseEvent {
    type: "join";
    data: PlayerData;
}

export interface LeaveBroadcastEvent extends BaseEvent {
    type: "leave";
    data: Pick<PlayerData, "cuid">;
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

export interface EndBroadcastEvent extends BaseEvent {
    type: "end";
    data: {
        winner?: cuid;
        newRoundIn: number;
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
    data: {
        text: string;
    }
}

export interface PongEvent extends BaseEvent {
    type: "pong";
}

export interface BaseGameState {
    prompt: string | null;
    players: PlayerData[];
    playingPlayers: cuid[];
    currentPlayer: cuid | null;
    rules: Rules;
    language: DictionaryName;
    bombExplodesIn: number | null;
    isPlaying: boolean;
}

export interface GameStateEvent extends BaseEvent {
    type: "state";
    data: BaseGameState;
}

export interface ErrorEvent extends BaseEvent {
    type: "error";
    data: {
        msg?: string;
    };
}

export interface DamageBroadcastEvent extends BaseEvent {
    type: "damage";
    data: {
        lives: number;
        player: cuid;
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
        from: cuid;
    };
}

export interface IncorrectBroadcastEvent extends BaseEvent {
    type: "incorrect";
    data: {
        for: cuid;
    };
}

export interface CorrectBroadcastEvent extends BaseEvent {
    type: "correct";
    data: {
        for: cuid;
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
    | CorrectBroadcastEvent
    | EndBroadcastEvent;
export type GameEvent = ChatEvent | RoundEvent | TextEvent | PingEvent | RuleEvent | GameStateEvent | PongEvent | PlayEvent | SubmitEvent | ErrorEvent;

export interface RoomCreationData {
    name: string;
    isPrivate: boolean;
}

export interface RoomData {
    cuid: string;
    player_count: number;
    name: string;
    language: DictionaryName;
}

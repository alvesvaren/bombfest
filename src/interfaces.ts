export interface PlayerData {
    uuid: string;
    name: string;
    text: string;
    connected: boolean;
}

export type uuid = string;
export type nonce = number | string;

export interface Rules {
    minWordsPerPrompt?: number;
    maxWordsPerPrompt?: number;
    minRoundTimer: number;
    minNewBombTimer: number;
    maxNewBombTimer: number;
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
    }
}

export interface TextEvent extends BaseEvent {
    type: "text";
    data: {
        text: string;
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
        currentPlayer?: uuid,
        prompt?: string,
        players: PlayerData[],
        rules: Rules,
    };
}

export interface TextBroadcastEvent extends BaseEvent {
    type: "text";
    data: {
        text: string;
        from: uuid;
    };
}

export type GameBroadcastEvent = TextBroadcastEvent | ChatBroadcastEvent | JoinBroadcastEvent | LeaveBroadcastEvent;
export type GameEvent = ChatEvent | RoundEvent | TextEvent | PingEvent | RuleEvent | GameStateEvent | PongEvent;

export interface RoomCreationData {
    name: string;
    isPrivate: boolean;
}
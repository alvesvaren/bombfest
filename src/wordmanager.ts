import { Nodehun } from "nodehun";
import fs from "fs";
import { DictionaryName, dicts, Rules } from "./interfaces";

type Dictionaries = { [Key in DictionaryName]: Nodehun };
interface Prompt {
    text: string;
    wordCount: number;
}
type PromptDict = { [Key in DictionaryName]: Prompt[] };

const huns: Dictionaries = {} as Dictionaries;
const prompts: PromptDict = {} as PromptDict;
dicts.forEach(dict => {
    huns[dict] = new Nodehun(fs.readFileSync(`./src/dictionaries/${dict}.aff`), fs.readFileSync(`./src/dictionaries/${dict}.dic`));
    prompts[dict] = (
        fs
            .readFileSync(`./src/dictionaries/${dict}.prompts`)
            .toString("utf-8")
            .split("\n")
            .map(line => {
                const [text, wordCount] = line.split(":");
                if (text && wordCount) {
                    return { text, wordCount: parseInt(wordCount) };
                }
                return null;
            })
            .filter(prompt => prompt !== null) as Prompt[]
    ).sort((a, b) => a.wordCount - b.wordCount);
});

export const checkValid = async (word: string, dictionary: DictionaryName) => {
    return await huns[dictionary].spell(word.toLowerCase());
};

export const getPrompts = (dictionary: DictionaryName, rules?: Rules) => {
    const filteredPrompts = prompts[dictionary].filter(prompt => {
        if (rules) {
            if (rules.maxWordsPerPrompt && prompt.wordCount > rules.maxWordsPerPrompt) {
                return false;
            }
            if (rules.minWordsPerPrompt && prompt.wordCount < rules.minWordsPerPrompt) {
                return false;
            }
        }
        return true;
    });
    return filteredPrompts;
};

export const getRandomPrompt = (dictionary: DictionaryName, rules?: Rules) => {
    const words = getPrompts(dictionary, rules);
    const randomIndex = Math.floor(Math.random() * words.length);
    return words[randomIndex]?.text;
};

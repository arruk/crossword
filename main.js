import {CrossWordApp} from "./crossword.js";

const app = new CrossWordApp({root : document});
await app.init();
app.renderGrid(0, 0);
app.bindButtons();
app.getClues();

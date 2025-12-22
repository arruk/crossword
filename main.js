import { createApp } from "./crossword.js";

const app = createApp({
	gridEl: document.getElementById("grid"),
	horEl: document.getElementById("hor"),
	verEl: document.getElementById("ver"),
	titleEl: document.getElementById("title"),
	nextBtn: document.getElementById("nextBtn"),
	solveBtn: document.getElementById("solveBtn"),
});

await app.loadWordlist();
app.bindUI();
app.renderTemplate(0);


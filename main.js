import { createApp } from "./crossword.js";

const app = await createApp({
	gridEl:   document.getElementById("grid"),
	horClues: document.getElementById("horClues"),
	verClues: document.getElementById("verClues"),
	titleEl:  document.getElementById("title"),
	nextBtn:  document.getElementById("nextBtn"),
	solveBtn: document.getElementById("solveBtn"),
	index: 0,
});

//const grids = await app.getGrids();
app.renderGrid();
//await app.loadWordlist();
//app.bindUI();
//app.selectTemplate(0);


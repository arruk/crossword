export function createApp({ gridEl, horEl, verEl, titleEl, nextBtn, solveBtn }) {

	const SIZE = 10;

	let wordStore = null;
	let slotsAll = [];
	let state = null;              // 2D: "#" | "" | "A"...
	let usedWords = new Set();
	let assignment = new Map();    // slotId -> word	  
	let wordsByLen = null;
	let wordsByLenTier = null;
	let tplIndex = 0;
	let currentDir = null;          // "across" | "down"
	let activePos = null;           // {r,c}
	let activeEl = null;
	let highlighted = [];
	let currentNums = null;
	let clueMap = { across: new Map(), down: new Map() };
	let activeClueEl = null;
	let slotByNumDir = { across: new Map(), down: new Map() };
	let cluesByWord = null;

	let puzzleLevel = "easy";
	
	const PROFILES = {
		easy:   { easy: 0.50, medium: 0.25, hard: 0.25 },
		medium: { easy: 0.25, medium: 0.50, hard: 0.25 },
		hard:   { easy: 0.20, medium: 0.30, hard: 0.50 },
	};

	const TEMPLATES = [
	  [
		"......#...",
		"......#...",
		"..........",
		"....#.....",
		"...#......",
		"###.....##",
		"#......#..",
		"..........",
		"....#.....",
		"....#.....",
	  ],
	  [
		"......#...",
		"......#...",
		"..........",
		"##........",
		"####.....#",
		"###.....##",
		"#.....####",
		"..........",
		"....#.....",
		"...##.....",
	  ],
	  [
		"###....###",
		"##......##",
		"#........#",
		"......#...",
		".....#....",
		"....#.....",
		"...#......",
		"#........#",
		"##......##",
		"###....###",
	  ],
	];

	/*async function loadWordlist() {
		//const r = await fetch("./words_by_len_tier.json");
		//wordsByLen = await r.json();
		const r = await fetch("./words_by_len_tier.json");
		const data = await r.json();
		wordStore = buildWordStore(data);		
		console.log("wordlist carregada");
	}*/

	async function loadWordlist() {
		const r = await fetch("./words_by_len_tier.json");
		const data = await r.json();
		wordStore = buildWordStore(data);

		try {
			const rc = await fetch("./clues.json");
			if (rc.ok) {
				const cdata = await rc.json();
				cluesByWord = cdata.clues || cdata; // suporta ambos formatos
			}
		} catch {}
	}	

	function shuffleInPlace(a) {
		for (let i = a.length - 1; i > 0; i--) {
			const j = (Math.random() * (i + 1)) | 0;
			[a[i], a[j]] = [a[j], a[i]];
		}
	}

	function buildWordStore(wordsByLenTier) {
		const store = {};
		for (const [lenKey, tiers] of Object.entries(wordsByLenTier)) {
			const L = Number(lenKey);
			store[lenKey] = {};

			for (const tier of ["easy", "medium", "hard"]) {
				const list = tiers?.[tier] || [];
				const set = new Set(list);

				// idx[pos][letter] -> array de palavras
				const idx = Array.from({ length: L }, () => Object.create(null));
				for (const w of list) {
					for (let i = 0; i < w.length; i++) {
						const ch = w[i];
						(idx[i][ch] ||= []).push(w);
					}
				}

				store[lenKey][tier] = { list, set, idx };
			}
		}
		return store;
	}	

	function assignSlotTiers(slots, level = "easy") {
		const p = PROFILES[level];
		const n = slots.length;

		let nEasy = Math.round(n * p.easy);
		let nMed  = Math.round(n * p.medium);
		let nHard = n - nEasy - nMed;

		// garante soma válida
		if (nHard < 0) { nHard = 0; nMed = n - nEasy; }

		const sorted = [...slots].sort((a, b) => b.len - a.len); // maiores primeiro
		let i = 0;

		for (let k = 0; k < nHard; k++) sorted[i++].tier = "hard";
		for (let k = 0; k < nMed;  k++) sorted[i++].tier = "medium";
		for (; i < sorted.length; i++) sorted[i].tier = "easy";
	}

	function makeState(rows) {
		return Array.from({ length: SIZE }, (_, r) =>
			Array.from({ length: SIZE }, (_, c) => (rows[r][c] === "#" ? "#" : ""))
		);
	}

	function syncStateToDOM() {
		for (let r = 0; r < SIZE; r++) {
			for (let c = 0; c < SIZE; c++) {
				const el = getCell(r, c);
				if (!el || el.disabled) continue;
				el.value = state[r][c] || "";
			}
		}
	}

	function slotPatternFromState(slot) {
		return slot.cells.map(({ r, c }) => {
			const v = state[r][c];
			return v && v !== "#" ? v : ".";
		}).join("");
	}

	function isSlotComplete(slot) {
		return slot.cells.every(({ r, c }) => state[r][c] && state[r][c] !== "#");
	}
	
	function tierOrderFor(slotTier, puzzleLevel = "easy") {
		const full =
			slotTier === "hard"   ? ["hard", "medium", "easy"] :
			slotTier === "medium" ? ["medium", "easy"] :
			["easy"];

		// opcional: em puzzle "hard", não desce até easy
		return puzzleLevel === "hard" ? full.slice(0, 2) : full;
	}

	function candidatesFromEntry(entry, pat) {
		const cons = [];
		for (let i = 0; i < pat.length; i++) if (pat[i] !== ".") cons.push([i, pat[i]]);

		let base = entry.list;
		if (cons.length) {
			cons.sort((a, b) =>
				(entry.idx[a[0]][a[1]]?.length ?? 1e9) - (entry.idx[b[0]][b[1]]?.length ?? 1e9)
			);
			const [p0, ch0] = cons.shift();
			base = entry.idx[p0][ch0] || [];
		}

		return base.filter(w => {
			if (usedWords.has(w)) return false;
			for (const [pos, ch] of cons) if (w[pos] !== ch) return false;
			return true;
		});
	}

	function candidatesForSlot(slot) {
		if (!wordStore) return [];

		const lenKey = String(slot.len);
		const pat = slotPatternFromState(slot);
		const tiers = tierOrderFor(slot.tier || "easy", puzzleLevel);

		for (const t of tiers) {
			const entry = wordStore[lenKey]?.[t];
			if (!entry) continue;

			// slot completo: valida em O(1), mas com fallback de tier
			if (!pat.includes(".")) {
				if (entry.set.has(pat) && !usedWords.has(pat)) return [pat];
				continue;
			}

			const c = candidatesFromEntry(entry, pat);
			if (c.length) return c; // achou no tier atual; se vazio, cai pro próximo tier
		}

		return [];
	}

	function candidatesForSlotAOLD(slot) {
		if (!wordStore) return [];

		const lenKey = String(slot.len);
		const tier = slot.tier || "easy";
		const entry = wordStore[lenKey]?.[tier];
		if (!entry) return [];

		const pat = slotPatternFromState(slot);

		// FAST PATH: slot completo -> valida em O(1)
		if (!pat.includes(".")) {
			if (!entry.set.has(pat)) return [];
			if (usedWords.has(pat)) return [];
			return [pat];
		}

		// coleta restrições (posições já fixas)
		const cons = [];
		for (let i = 0; i < pat.length; i++) {
			const p = pat[i];
			if (p !== ".") cons.push([i, p]);
		}

		// escolhe o “melhor ponto de partida”: a restrição mais rara
		let base = entry.list;
		if (cons.length > 0) {
			cons.sort((a, b) => {
				const la = entry.idx[a[0]][a[1]]?.length ?? 1e9;
				const lb = entry.idx[b[0]][b[1]]?.length ?? 1e9;
				return la - lb;
			});
			const [pos0, ch0] = cons.shift();
			base = entry.idx[pos0][ch0] || [];
		}

		return base.filter(w => {
			if (usedWords.has(w)) return false;
			for (const [pos, ch] of cons) {
				if (w[pos] !== ch) return false;
			}
			return true;
		});
	}

	function candidatesForSlotOldOld(slot) {
		if (!wordsByLen) return [];

		const byLen = wordsByLen[String(slot.len)];
		const tier = slot.tier || "easy";
		const list = (byLen && byLen[tier]) ? byLen[tier] : [];

		const pat = slotPatternFromState(slot);

		return list.filter(w => {
			if (usedWords.has(w)) return false;
			for (let i = 0; i < slot.len; i++) {
				const p = pat[i];
				if (p !== "." && p !== w[i]) return false;
			}
			return true;
		});
	}

	function candidatesForSlotOld(slot) {
		if (!wordsByLen) return [];
		const list = wordsByLen[String(slot.len)] || [];
		const pat = slotPatternFromState(slot);

		return list.filter(w => {
			if (usedWords.has(w)) return false;
			for (let i = 0; i < slot.len; i++) {
				const p = pat[i];
				if (p !== "." && p !== w[i]) return false;
			}
			return true;
		});
	}

	function putCluesInClues() {
		for (const slot of slotsAll) {
			const el = clueMap[slot.dir]?.get(slot.num);
			if (!el) continue;

			const word = assignment.get(slot.id);
			if (!word) {
				el.textContent = `${slot.num}. (${slot.len})`;
				continue;
			}

			const clue = cluesByWord?.[word] || "(sem dica)";
			el.textContent = `${slot.num}. (${slot.len}) ${clue}`;
		}
	}

	function putAnswersInClues() {
		for (const slot of slotsAll) {
			const el = clueMap[slot.dir]?.get(slot.num);
			if (!el) continue;

			const word = assignment.get(slot.id);
			el.textContent = word
				? `${slot.num}. (${slot.len}) ${word}`
				: `${slot.num}. (${slot.len})`;
		}
	}
	
	function placeWord(slot, word) {
		const changes = [];
		for (let i = 0; i < slot.cells.length; i++) {
			const { r, c } = slot.cells[i];
			const cur = state[r][c];
			const ch = word[i];

			if (cur === "#") return null;
			if (cur === "") {
				state[r][c] = ch;
				changes.push({ r, c, prev: "" });
			} else if (cur !== ch) {
				for (let k = changes.length - 1; k >= 0; k--) {
					const x = changes[k];
					state[x.r][x.c] = x.prev;
				}
				return null;
			}
		}
		assignment.set(slot.id, word);
		usedWords.add(word);
		return changes;
	}


	function undoPlace(slot, word, changes) {
		for (let k = changes.length - 1; k >= 0; k--) {
			const x = changes[k];
			state[x.r][x.c] = x.prev;
		}
		assignment.delete(slot.id);
		usedWords.delete(word);
	}

	function chooseNextSlot() {
		let best = null;
		let bestCands = null;

		for (const slot of slotsAll) {
			if (assignment.has(slot.id)) continue;
			//if (isSlotComplete(slot)) continue;

			const cands = candidatesForSlot(slot);
			if (cands.length === 0) return { slot, cands };

			if (!best || cands.length < bestCands.length) {
				best = slot;
				bestCands = cands;
				if (bestCands.length === 1) break;
			}
		}

		return best ? { slot: best, cands: bestCands } : null;
	}

	function solveBacktrack() {
		const pick = chooseNextSlot();
		if (pick === null) return true; // tudo ok
		const { slot, cands } = pick;
		if (cands.length === 0) return false;
		shuffleInPlace(cands);

		for (const w of cands) {
			const changes = placeWord(slot, w);
			if (!changes) continue;

			if (solveBacktrack()) return true;

			undoPlace(slot, w, changes);
		}
		return false;
	}

	function buildIntersections(slots) {
		// cell -> [{ slotId, pos }]
		const cellMap = new Map();

		for (const slot of slots) {
			slot.cells.forEach(({ r, c }, pos) => {
				const key = `${r},${c}`;
				if (!cellMap.has(key)) cellMap.set(key, []);
				cellMap.get(key).push({ slotId: slot.id, pos });
			});
		}

		// slotId -> [{ otherId, posThis, posOther, r, c }]
		const adj = new Map();
		for (const s of slots) adj.set(s.id, []);

		for (const [key, list] of cellMap.entries()) {
			if (list.length < 2) continue; // sem cruzamento
			const [r, c] = key.split(",").map(Number);

			for (let i = 0; i < list.length; i++) {
				for (let j = 0; j < list.length; j++) {
					if (i === j) continue;
					adj.get(list[i].slotId).push({
						otherId: list[j].slotId,
						posThis: list[i].pos,
						posOther: list[j].pos,
						r, c
					});
				}
			}
		}

		return adj;
	}

	function buildSlotCells(startR, startC, dir, len) {
		const cells = [];
		const [dr, dc] = (dir === "down") ? [1, 0] : [0, 1];
		for (let i = 0; i < len; i++) cells.push({ r: startR + dr*i, c: startC + dc*i });
		return cells;
	}

	function slotPattern(slot) {
		return slot.cells.map(({r,c}) => {
			const v = getCell(r,c).value.trim().toUpperCase();
			return v ? v : ".";
		}).join("");
	}

	function candidatesFor(slot) {
		if (!wordsByLen) return [];
		const list = wordsByLen[String(slot.len)] || [];
		const pat = slotPattern(slot);

		return list.filter(w => {
			for (let i = 0; i < slot.len; i++) {
				if (pat[i] !== "." && pat[i] !== w[i]) return false;
			}
			return true;
		});
	}

	function isWritable(r, c) {
		const el = getCell(r, c);
		return el && !el.disabled;
	}

	function clearHighlight() {
		for (const el of highlighted) el.classList.remove("hl");
		highlighted = [];
		if (activeEl) activeEl.classList.remove("active");
		activeEl = null;
	}

	function collectWordCells(r, c, dir) {
		if (!isWritable(r, c)) return [];
		const [dr, dc] = (dir === "down") ? [1, 0] : [0, 1];

		// volta até o começo da palavra
		let sr = r, sc = c;
		while (isWritable(sr - dr, sc - dc)) { sr -= dr; sc -= dc; }

		// coleta até o fim
		const cells = [];
		let cr = sr, cc = sc;
		while (isWritable(cr, cc)) {
			cells.push(getCell(cr, cc));
			cr += dr; cc += dc;
		}
		return cells;
	}

	function setSelection(r, c, toggleIfSame) {
		if (!isWritable(r, c)) return;

		if (!currentDir) currentDir = "across";

		const same = activePos && activePos.r === r && activePos.c === c;
		if (toggleIfSame && same) {
			currentDir = (currentDir === "across") ? "down" : "across";
		} else if (!activePos) {
			// primeiro highlight sempre horizontal
			currentDir = "across";
		}

		activePos = { r, c };

		// aplica highlight
		for (const el of highlighted) el.classList.remove("hl");
		highlighted = collectWordCells(r, c, currentDir);
		for (const el of highlighted) el.classList.add("hl");

		// marca célula ativa
		if (activeEl) activeEl.classList.remove("active");
		activeEl = getCell(r, c);
		activeEl.classList.add("active");

		highlightClue(r, c);
	}

	function stepFocusOne(r, c, dirForward) {
		if (!currentDir) currentDir = "across";
		const [dr, dc] = (currentDir === "down") ? [1, 0] : [0, 1];
		const nr = r + (dirForward ? dr : -dr);
		const nc = c + (dirForward ? dc : -dc);
		const next = getCell(nr, nc);
		if (next && !next.disabled) next.focus();
	}
	function getCell(r, c) {
		return gridEl.querySelector(`[data-r="${r}"][data-c="${c}"]`);
	}

	function moveFocus(r, c, dr, dc) {
		let nr = r + dr, nc = c + dc;
		while (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE) {
			const cell = getCell(nr, nc);
			if (cell && !cell.disabled) { cell.focus(); return; }
			nr += dr; nc += dc;
		}
	}

	function focusFirstWritable() {
		for (let r = 0; r < SIZE; r++) {
			for (let c = 0; c < SIZE; c++) {
				const cell = getCell(r, c);
				if (cell && !cell.disabled) { cell.focus(); return; }
			}
		}
	}

	function computeNumbers(rows, { minLen = 3 } = {}) {
		const nums = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
		const across = [];
		const down = [];	  
		let n = 1;

		const open = (r, c) => rows[r][c] === ".";

		const acrossLen = (r, c) => {
			let k = c;
			while (k < SIZE && open(r, k)) k++;
			return k - c;
		};

		const downLen = (r, c) => {
			let k = r;
			while (k < SIZE && open(k, c)) k++;
			return k - r;
		};


		//verticais: cima->baixo
		for (let r = 0; r < SIZE; r++) {
			for (let c = 0; c < SIZE; c++) {
				if (!open(r, c)) continue;
				const starts = (r === 0) || !open(r - 1, c);
				if (!starts) continue;
				const len = downLen(r, c);
				if (len < minLen) continue;
				if (nums[r][c] === 0) nums[r][c] = n++;
				down.push({ num: nums[r][c], r, c, len });
			}
		}

		//horizontais: esquerda->direita
		for (let r = 0; r < SIZE; r++) {
			for (let c = 0; c < SIZE; c++) {
				if (!open(r, c)) continue;
				const starts = (c === 0) || !open(r, c - 1);
				if (!starts) continue;
				const len = acrossLen(r,c);
				if (len < minLen) continue;
				if (nums[r][c] === 0) nums[r][c] = n++;
				across.push({ num: nums[r][c], r, c, len });
			}
		}


		return { nums, across, down };
	}

	function getWordStart(r, c, dir) {
		const [dr, dc] = (dir === "down") ? [1, 0] : [0, 1];
		let sr = r, sc = c;
		while (isWritable(sr - dr, sc - dc)) { sr -= dr; sc -= dc; }
		return { sr, sc };
	}

	function highlightClue(r, c) {
		if (!currentNums || !currentDir) return;

		if (activeClueEl) activeClueEl.classList.remove("active");
		activeClueEl = null;

		const { sr, sc } = getWordStart(r, c, currentDir);
		const num = currentNums[sr]?.[sc] || 0;
		if (!num) return;

		const el = clueMap[currentDir]?.get(num);
		if (el) {
			el.classList.add("active");
			activeClueEl = el;
		}
	}
	
	let slotByDirNum = { across: new Map(), down: new Map() };

	function getSlotAtCell(r, c, dir) {
		const { sr, sc } = getWordStart(r, c, dir);
		const num = currentNums?.[sr]?.[sc] || 0;
		return num ? slotByDirNum[dir].get(num) : null;
	}

	function updateDoneAtCell(r, c) {
		if (!assignment || assignment.size === 0) return;

		for (const dir of ["across", "down"]) {
			const slot = getSlotAtCell(r, c, dir);
			if (!slot) continue;

			const sol = assignment.get(slot.id);
			const clueEl = clueMap[dir]?.get(slot.num);
			if (!sol || !clueEl) continue;

			const letters = slot.cells.map(({ r, c }) =>
				(getCell(r, c)?.value || "").trim().toUpperCase()
			);

			const ok = letters.every(ch => ch) && letters.join("") === sol;
			clueEl.classList.toggle("done", ok);
		}
	}

	function readSlotFromDOM(slot) {
		return slot.cells.map(({r,c}) => (getCell(r,c).value || "").toUpperCase()).join("");
	}

	function updateClueDone(slot) {
		const expected = assignment.get(slot.id);
		if (!expected) return; // se você ainda não tem respostas

		const got = readSlotFromDOM(slot);
		const ok = (got.length === slot.len) && !got.includes("") && (got === expected);

		const el = clueMap[slot.dir]?.get(slot.num);
		if (el) el.classList.toggle("done", ok);
	}
	function renderTemplate(index) {
		const rows = TEMPLATES[index];
		const { nums, across, down } = computeNumbers(rows, { minLen: 3 });
		
		currentNums = nums;

		const slotsAcross = across.map((s, i) => ({
			id: `A${i}`,
			dir: "across",
			num: s.num,
			len: s.len,
			cells: buildSlotCells(s.r, s.c, "across", s.len),
		}));

		const slotsDown = down.map((s, i) => ({
			id: `D${i}`,
			dir: "down",
			num: s.num,
			len: s.len,
			cells: buildSlotCells(s.r, s.c, "down", s.len),
		}));

		titleEl.textContent = `Template ${index + 1}`;
		gridEl.innerHTML = "";

		for (let r = 0; r < SIZE; r++) {
			for (let c = 0; c < SIZE; c++) {
				const ch = rows[r][c];

				const wrap = document.createElement("div");
				wrap.className = "cellwrap";

				if (ch === "." && nums[r][c] > 0) {
					const s = document.createElement("span");
					s.className = "num";
					s.textContent = String(nums[r][c]);
					wrap.appendChild(s);
				}

				const input = document.createElement("input");
				input.className = "cell";
				input.maxLength = 1;
				input.inputMode = "text";
				input.autocomplete = "off";
				input.spellcheck = false;
				input.dataset.r = r;
				input.dataset.c = c;

				if (ch === "#") {
					input.disabled = true;
					input.classList.add("block");
					input.value = "";
				} else {

					input.addEventListener("click", () => {
						if (!currentDir) currentDir = "across";
						setSelection(r, c, true);
					});

					input.addEventListener("input", () => {
						input.value = (input.value || "").toUpperCase().slice(0, 1);
						if (!activePos) setSelection(r, c, false);
						stepFocusOne(r, c, true);
						updateDoneAtCell(r, c);					
					});

					function syncSelectionFromFocus(dir) {
						const el = document.activeElement;
						if (el && el.classList?.contains("cell") && !el.disabled) {
							currentDir = dir;
							setSelection(+el.dataset.r, +el.dataset.c, false);
						}
					}

					input.addEventListener("keydown", (e) => {
						const key = e.key;

						if (key === "ArrowLeft")  { e.preventDefault(); moveFocus(r, c, 0, -1); syncSelectionFromFocus("across");}
						if (key === "ArrowRight") { e.preventDefault(); moveFocus(r, c, 0,  1); syncSelectionFromFocus("across");}
						if (key === "ArrowUp")    { e.preventDefault(); moveFocus(r, c, -1, 0); syncSelectionFromFocus("down");}
						if (key === "ArrowDown")  { e.preventDefault(); moveFocus(r, c,  1, 0); syncSelectionFromFocus("down");}

						if (key === "Backspace" && input.value === "") {
							e.preventDefault();
							stepFocusOne(r, c, false);
							const prev = document.activeElement;
							if (prev && prev.classList?.contains("cell")) prev.value = "";
						}
					});
				}

				wrap.appendChild(input);
				gridEl.appendChild(wrap);
			}
		}

		const horEl = document.getElementById("hor");
		const verEl = document.getElementById("ver");

		horEl.innerHTML = "";
		verEl.innerHTML = "";

		clueMap = { across: new Map(), down: new Map() };

		across.sort((a,b)=>a.num-b.num);
		down.sort((a,b)=>a.num-b.num);
		
		slotByDirNum = { across: new Map(), down: new Map() };
		for (const s of slotsAcross) slotByDirNum.across.set(s.num, s);
		for (const s of slotsDown)   slotByDirNum.down.set(s.num, s);		

		for (const s of across) {
			const item = document.createElement("div");
			item.className = "clue-item";
			item.dataset.num = s.num;
			item.textContent = `${s.num}. (${s.len})`;
			item.dataset.slotId = s.id;
			clueMap.across.set(s.num, item);

			item.addEventListener("click", () => {
				currentDir = "across";
				setSelection(s.r, s.c, false);
				getCell(s.r, s.c)?.focus();
			});

			horEl.appendChild(item);
		}

		for (const s of down) {
			const item = document.createElement("div");
			item.className = "clue-item";
			item.dataset.num = s.num;
			item.textContent = `${s.num}. (${s.len})`;
			item.dataset.slotId = s.id;
			clueMap.down.set(s.num, item);

			item.addEventListener("click", () => {
				currentDir = "down";
				setSelection(s.r, s.c, false);
				getCell(s.r, s.c)?.focus();
			});			

			verEl.appendChild(item);
		}

		focusFirstWritable();

		slotsAll = [...slotsAcross, ...slotsDown];
		assignSlotTiers(slotsAll, puzzleLevel);
		const intersections = buildIntersections(slotsAll);

		state = makeState(rows);
		//usedWords = new Set();
		//assignment = new Map();

		console.log("slots total:", slotsAll.length);
		console.log("exemplo cruzamentos do primeiro slot:", slotsAll[0].id, intersections.get(slotsAll[0].id));

	}

	function bindUI() {
		solveBtn.addEventListener("click", () => {
			if (!wordStore) { console.warn("wordlist não carregou"); return; }

			const rows = TEMPLATES[tplIndex];
			state = makeState(rows);
			usedWords = new Set();
			assignment = new Map();

			const ok = solveBacktrack();
			console.log("solve:", ok);

			if (ok) putCluesInClues();
		});

		nextBtn.addEventListener("click", () => {
			tplIndex = (tplIndex + 1) % TEMPLATES.length;
			renderTemplate(tplIndex);
		});
	}

	return { loadWordlist, renderTemplate, bindUI };
}

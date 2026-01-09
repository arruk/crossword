export async function createApp({ gridEl, horClues, verClues, titleEl, nextBtn, solveBtn, index}) {
	
	const BASE = "http://127.0.0.1:8000/";

	let templates = await getTemplates();
	let {grid, slots} = templates[index];
	let highl = {}

	async function loadJsonFile(path){
		const url = new URL(path, BASE).toString();
		const file = await fetch(url);
		if (!file.ok) throw new Error("HTTP ${file.status} em ${url}");
		return await file.json();
	}

	async function getTemplates(){
		const data = await loadJsonFile("data/jsons/tmpl.json");

		if(!Array.isArray(data?.templates)){
			throw new Error("JSON sem 'templates'")
		}

		return data.templates.map((t, i) => {
			if(!("grid" in t)) throw new Error(`template[${i}] sem 'grid'`);
			if(!("slots" in t)) throw new Error(`template[${i}] sem 'slots'`);
			return { grid: t.grid, slots: t.slots };
		});
	}

	function putCellsInSlots(){
		slots.forEach((v, i) => {
			v['cells'] = [];
			const [r, c] = v['coord'];
			for(let i = 0; i<v.num; i++){
				const [rr, cc] = v['id'][0] === 'D' ? [r+i, c] : [r, c+i];
				v['cells'].push((rr, cc));
			}
		});
	}

	function getClue(id) {
		return verClues.querySelector(`[data-slot-id="${id}"]`) ||
			   horClues.querySelector(`[data-slot-id="${id}"]`);
	}

	function getCell(r, c) {
		return gridEl.querySelector(`[data-r="${r}"][data-c="${c}"]`);
	}

	function moveFocus(r, c) {
		const cell = getCell(r, c);
		if (cell && !cell.disabled) {
			cell.focus();
			toggleHighl(r, c);
			return;
		}
	}

	function toggleHighl(r, c, dir=""){
		const cell = getCell(r, c);
		if ((cellInSlot(r, c, highl?.slot) && !(highl.cell[0]===r && highl.cell[1]===c) && (dir === "")) ||
			(((highl?.cell?.[0]??-1)===r && (highl?.cell?.[1]??-1)===c) && (dir===highl?.slot?.id?.[0]??""))){
			highl = {'slot': highl.slot, 'cell': [r, c] };
			return;
		}

		let slot;
		if (((!highl?.slot&& dir==="") || ((highl?.slot?.id?.[0]??"") === 'D' && dir==="") || dir==='H'))
			slot = getSlotHead(r, c, 'H');
		else if (dir === 'D' || highl.slot.id[0] === 'H')
			slot = getSlotHead(r, c, 'D');

		changeHighlSlot(highl?.slot, slot);
		changeHighlClue(highl?.slot, slot);
		highl = {'slot': slot, 'cell': [r, c] };
	}

	function changeHighlSlot(oldS, newS){
		oldS?.cells.forEach((v, i) => getCell(v[0], v[1]).classList.remove("hl"));
		newS?.cells.forEach((v, i) => getCell(v[0], v[1]).classList.add("hl"));
	}

	function changeHighlClue(oldS, newS){
		getClue(oldS?.id)?.classList.remove("active");
		getClue(newS?.id)?.classList.add("active");
	}

	function cellInSlot(r, c, slot){
		return slot?.cells?.some(([rr, cc]) => rr === r && cc === c) ?? false;
	}

	function getSlotHead(r, c, dir){
		let s = 0;
		if(dir === 'H'){
			let i = c;
			while (i > 0 && grid[r][i-1] !== '#') i--;	
			while(s < slots.length &&
				  (slots[s].coord[0] !== r || 
				   slots[s].coord[1] !== i || 
				   slots[s].id[0] !== dir)
				 ) s++;
		} else {
			let i = r;
			while (i > 0 && grid[i-1][c] !== '#') i--;
			while(s < slots.length &&
				  (slots[s].coord[0] !== i || 
				   slots[s].coord[1] !== c || 
				   slots[s].id[0] !== dir)
				 ) s++;
		}

		return slots[s];
	}

	function renderGridCell(chr, r, c){
		const elem = (chr == '#') ? document.createElement("div")  :
									document.createElement("input");
		if (chr == '#'){
			elem.className = "block";
			elem.disabled = true;
		} else {
			elem.className = "cell";
			
			elem.maxLength = 1;
			elem.inputMode = "text";
			elem.autocomplete = "off";
			elem.dataset.r = r;
			elem.dataset.c = c;

			elem.addEventListener("click", () => {
				moveFocus(r,c);
			});

			elem.addEventListener("input", (e) => {
				elem.value = (elem.value || "").toUpperCase();
			});

			elem.addEventListener("keydown", (e) => {
				e.preventDefault(); 

				if (e.key === "ArrowLeft")  moveFocus(r, c-1);
				if (e.key === "ArrowRight") moveFocus(r, c+1); 
				if (e.key === "ArrowUp")    moveFocus(r-1, c); 
				if (e.key === "ArrowDown")  moveFocus(r+1, c);

				if (e.key === "Backspace" && elem.value !== ""){
					elem.value = "";
					return;
				}
				
				if (e.key.length == 1){
					if(!/^[a-zA-Z]$/.test(e.key))
						return;
					elem.value = (e.key || "").toUpperCase();
				}
			});
		}
		gridEl.appendChild(elem);
	}

	function renderClues(){
		const nc = slots.length;
		for (const s of slots){
			const item = document.createElement("div");

			item.className = "clue-item";
			item.textContent = `${s.id[1]}${s.id[2] ?? ""}. (${s.id})`;
			item.dataset.num = s.id[1];
			item.dataset.slotId = s.id;

			item.addEventListener("click", () => {
				toggleHighl(s.coord[0], s.coord[1], s.id[0]);
			});

			const el = s.id[0] === 'H' ? horClues : verClues;
			el.appendChild(item);
		}
	}

	function renderGrid(){

		const size = grid.length;

		gridEl.innerHTML = "";
		gridEl.style.setProperty("--n", size);

		for (let r=0; r < size; r++){
			for (let c=0; c < size; c++){
				const chr = grid[r][c];
				renderGridCell(chr, r, c);
			}
		}

		renderClues();
	}
	return { renderGrid };
}

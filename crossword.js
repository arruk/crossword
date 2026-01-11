export class CrossWordApp {
	constructor({root = document} = {}) {
		this.gridEl   = root.querySelector("#grid");
		this.horClues = root.querySelector("#horClues");
		this.verClues = root.querySelector("#verClues");
		this.titleEl  = root.querySelector("#title");
		this.nextBtn  = root.querySelector("#nextBtn");
		this.solBtn   = root.querySelector("#solBtn");
		this.qstInp   = root.querySelector("#qstInp");
		this.qstBtn   = root.querySelector("#qstBtn");
		this.awsLab   = root.querySelector("#awsLab");

		this.templates = [];
		this.grid = null;
		this.slots = [];

		this.solutions = [];
		this.solution = [];
		
		this.tmplIndex = 0; 
		this.solIndex = 0;

		this.highl = {};
	}

	async init(){

		this.templates = await this.getTemplates();

		const s = await this.getSolutions();
		this.solutions = s.solutions;

		this.clues = await this.getClues();

	}

	async loadJsonFile(path){
		const file = await fetch(path);
		if (!file.ok) throw new Error("HTTP ${file.status} em ${file.url}");
		return await file.json();
	}

	async getSolutions(){
		let data = await this.loadJsonFile("data/jsons/sols.json");
		return { num_sols: data.length, solutions: data};
	}

	async getClues(){
		const data = await this.loadJsonFile("data/jsons/clues.json");
		return data.clues;
	}

	async getTemplates(){
		const data = await this.loadJsonFile("data/jsons/tmpl.json");

		if(!Array.isArray(data?.templates)){
			throw new Error(`JSON sem 'this.templates'`);
		}

		return data.templates.map((t, i) => {
			if(!("grid" in t)) throw new Error(`template[${i}] sem 'grid'`);
			if(!("slots" in t)) throw new Error(`template[${i}] sem 'slots'`);
			return { grid: t.grid, slots: t.slots };
		});
	}

	unifySolution(slots, solution){
		this.slots.forEach((s, i) => s.word = this.solution[i]?.word ?? "");
	}

	putCellsInSlots(){
		this.slots.forEach((v, i) => {
			v['cells'] = [];
			const [r, c] = v['coord'];
			for(let i = 0; i<v.num; i++){
				const [rr, cc] = v['id'][0] === 'D' ? [r+i, c] : [r, c+i];
				v['cells'].push((rr, cc));
			}
		});
	}

	getClue(id) {
		return this.verClues.querySelector(`[data-slot-id="${id}"]`) ||
			   this.horClues.querySelector(`[data-slot-id="${id}"]`);
	}

	getCell(r, c) {
		return this.gridEl.querySelector(`[data-r="${r}"][data-c="${c}"]`);
	}

	moveFocus(r, c) {
		const cell = this.getCell(r, c);
		if (cell && !cell.disabled) {
			cell.focus();
			this.toggleHighl(r, c);
			return;
		}
	}

	moveOnce(r, c, sen){
		const dir = this.highl?.slot.id[0] ?? 'H';
		if (dir === 'H') this.moveFocus(r, c+sen);
		else             this.moveFocus(r+sen, c);
	}

	toggleHighl(r, c, dir=""){
		const cell = this.getCell(r, c);
		if ((this.cellInSlot(r, c, this.highl?.slot) && !(this.highl.cell[0]===r && this.highl.cell[1]===c) && (dir === "")) ||
			(((this.highl?.cell?.[0]??-1)===r && (this.highl?.cell?.[1]??-1)===c) && (dir===this.highl?.slot?.id?.[0]??""))){
			this.highl = {'slot': this.highl.slot, 'cell': [r, c] };
			return;
		}

		let slot;
		if (((!this.highl?.slot&& dir==="") || ((this.highl?.slot?.id?.[0]??"") === 'D' && dir==="") || dir==='H'))
			slot = this.getSlotHead(r, c, 'H');
		else if (dir === 'D' || this.highl.slot.id[0] === 'H')
			slot = this.getSlotHead(r, c, 'D');

		this.changeHighlSlot(this.highl?.slot, slot);
		this.changeHighlClue(this.highl?.slot, slot);
		this.highl = {'slot': slot, 'cell': [r, c] };
	}

	changeHighlSlot(oldS, newS){
		oldS?.cells.forEach((v, i) => this.getCell(v[0], v[1]).classList.remove("hl"));
		newS?.cells.forEach((v, i) => this.getCell(v[0], v[1]).classList.add("hl"));
	}

	changeHighlClue(oldS, newS){
		this.getClue(oldS?.id)?.classList.remove("active");
		this.getClue(newS?.id)?.classList.add("active");
	}

	cellInSlot(r, c, slot){
		return slot?.cells?.some(([rr, cc]) => rr === r && cc === c) ?? false;
	}

	getSlotHead(r, c, dir){
		let s = 0;
		if(dir === 'H'){
			let i = c;
			while (i > 0 && this.grid[r][i-1] !== '#') i--;	
			while(s < this.slots.length &&
				  (this.slots[s].coord[0] !== r || 
				   this.slots[s].coord[1] !== i || 
				   this.slots[s].id[0] !== dir)
				 ) s++;
		} else {
			let i = r;
			while (i > 0 && this.grid[i-1][c] !== '#') i--;
			while(s < this.slots.length &&
				  (this.slots[s].coord[0] !== i || 
				   this.slots[s].coord[1] !== c || 
				   this.slots[s].id[0] !== dir)
				 ) s++;
		}

		return this.slots[s];
	}

	getWordClue(word){
		return this.clues?.[word] ?? "";
	}

	verifyClue(r, c){
		for (const dir of ['H', 'D']) {
			const s = this.getSlotHead(r, c, dir);
			const ok = s.cells.every((v, i) => this.getCell(v[0], v[1]).value === (s?.word?.[i] ?? "#"));
			if (ok) this.getClue(s.id).classList.add("done");
			else    this.getClue(s.id).classList.remove("done");
		}
	}

	renderGridCell(chr, r, c){
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
				this.moveFocus(r,c);
			});

			elem.addEventListener("input", (e) => {
				elem.value = (elem.value || "").toUpperCase();
			});

			elem.addEventListener("keydown", (e) => {
				e.preventDefault(); 

				if (e.key === "ArrowLeft")  this.moveFocus(r, c-1);
				if (e.key === "ArrowRight") this.moveFocus(r, c+1); 
				if (e.key === "ArrowUp")    this.moveFocus(r-1, c); 
				if (e.key === "ArrowDown")  this.moveFocus(r+1, c);

				if (e.key === "Backspace" && elem.value !== ""){
					elem.value = "";
					this.moveOnce(r, c, -1);
					this.verifyClue(r,c);
					return;
				} else if (e.key === "Backspace"){
					this.moveOnce(r, c, -1);
				}
				
				if (e.key.length == 1){
					if(!/^[a-zA-Z]$/.test(e.key))
						return;
					elem.value = (e.key || "").toUpperCase();
					this.moveOnce(r, c, 1);
					// TODO: improve this verification, by maybe writing letters in cells
					this.verifyClue(r,c);
				}
			});
		}
		this.gridEl.appendChild(elem);
	}

	renderClues(){
		const nc = this.slots.length;
		for (const s of this.slots){
			
			const clue = this.getWordClue(s.word);

			const item = document.createElement("div");

			item.className = "clue-item";
			item.textContent = `${s.id[1]}${s.id[2] ?? ""}. (${s.id}) ${clue}`;
			item.dataset.num = s.id[1];
			item.dataset.slotId = s.id;

			item.addEventListener("click", () => {
				this.toggleHighl(s.coord[0], s.coord[1], s.id[0]);
				this.getCell(s.coord[0], s.coord[1]).focus();
			});

			const el = s.id[0] === 'H' ? this.horClues : this.verClues;
			el.appendChild(item);
		}
	}

	renderGrid(index, sol){

		const t = this.templates[index];
		this.grid = t.grid;
		this.slots = t.slots;

		this.solution = this.solutions[this.grid.length]?.[sol] ?? [];

		this.highl = {};

		this.unifySolution(this.slots, this.solution);
		
		const size = this.grid.length;

		this.verClues.innerHTML = "";
		this.horClues.innerHTML = "";
		this.gridEl.innerHTML   = "";
		this.gridEl.style.setProperty("--n", size);

		for (let r=0; r < size; r++){
			for (let c=0; c < size; c++){
				const chr = this.grid[r][c];
				this.renderGridCell(chr, r, c);
			}
		}
		this.renderClues();
	}

	bindButtons(){
		this.nextBtn.addEventListener("click", () => {
			this.solIndex = 0;
			this.tmplIndex = (this.tmplIndex + 1) % this.templates.length;
			this.renderGrid(this.tmplIndex, this.solIndex);
		});

		this.solBtn.addEventListener("click", () => {
			console.log(this.tmplIndex, this.templates[this.tmplIndex].grid.length);
			this.solIndex = (this.solIndex + 1) % 
				this.solutions[
					this.templates[this.tmplIndex].grid.length
				].length;
			console.log(this.solIndex);
			this.renderGrid(this.tmplIndex, this.solIndex);
		});

		this.qstBtn.addEventListener("click", () => {
			const answer = this.slots.find(s => s.id === this.qstInp.value) ?? "nao encontrado";
			this.awsLab.textContent = answer.word;
		});

	

	}


}

from dataclasses import dataclass, field
from collections import defaultdict
from fnmatch import fnmatchcase
from math import inf
import json
import random
import copy
import time

@dataclass
class Slot:
    id:     str = ""
    coord:  tuple[int,int] = (0,0)
    num:    int = 0
    word:   str = ""
    change: dict[tuple[int, int], str] | None = None
    fits:   set[str] = field(default_factory=set)
    cells:  list[tuple[int,int]] = field(default_factory=list)


@dataclass
class Game:
    size: int = 10
    grid: list[str]     = field(default_factory=list)
    words: set[str]    = field(default_factory=set)
    slots: list["Slot"] = field(default_factory=list)
    
    @property
    def done(self) -> bool:
        return bool(self.slots) and all(s.word for s in self.slots)

    def __init__(self, size: int = 10):
        self.size = size
        self.templ = self.get_template(size)
        self.grid =  self.templ.copy()
        self.slots = self._get_slots()
        self.words = set()

    def get_template(self, size: int = 7):
        try:
            with open("data/jsons/tmpl.json", "r", encoding="utf-8") as file:
                json_file = json.load(file)
        except Exception:
            raise

        templates = json_file.get("templates", [])
        for t in templates:
            if t.get("size") == size:
                return t.get("grid")
        return None

    def _slots_down(self, template, r, c):
        count = 0
        cells = [(r,c)]
        while r+count+1 < self.size and template[r+count+1][c] != '#':
            count += 1
            cells.append((r+count, c))
        return count+1, cells

    def _slots_horz(self, template, r, c):
        count = 0
        cells = [(r,c)]
        while c+count+1 < self.size and template[r][c+count+1] != '#':
            count += 1
            cells.append((r, c+count))
        return count+1, cells


    def _first_char(self, template, r, c, dir):
        match dir:
            case "down":
                return (r > 0 and template[r-1][c] == '#') or (r == 0)
            case "horz":
                return (c > 0 and template[r][c-1] == '#') or (c == 0)

    def _get_slots(self):
        template = self.grid
        slots = []
        slot_num = 1
        for r in range(self.size):
            for c in range(self.size):
                if template[r][c] == '#':
                    continue

                num_d, cellsd = self._slots_down(template, r, c)
                num_h, cellsh = self._slots_horz(template, r, c)
                cond = False

                if num_d > 2 and self._first_char(template, r, c, "down"):
                    p = Slot("D" + str(slot_num), (r, c), num_d, cells=cellsd)
                    slots.append(p)
                    cond = True

                if num_h > 2 and self._first_char(template, r, c, "horz"):
                    p = Slot("H" + str(slot_num), (r, c), num_h, cells=cellsh)
                    slots.append(p)
                    cond = True

                if cond:
                    slot_num += 1

        return slots

    def empty_grid(self):
        self.words.clear()
        self.grid = self.templ.copy()

    def print_grid(self):
        for r in range(self.size):
            for c in range(self.size):
                print(f"{self.grid[r][c]}", end="")
            print("")

class CwSolver:
    def __init__(self, game, words, seed: int | None = None):
        self.game = game
        self.bylen = words.bylen
        self.index = words.index
        self.deadline = None
        self.rng = random.Random(seed)
    
    def solve(self):
        self._start_slots()
        self._backtrack()

        solution = {
                "slots": [{
                    "id":   s.id,
                    "coord":s.coord,
                    "num":  s.num,
                    "word": s.word,
                    } for s in game.slots]
                }

        return solution

    def solve_n(self, num: int = 1):
        solutions = []
        self._start_slots()
        base = copy.deepcopy(self.game)

        for _ in range(num):
            self.solve_timeout(seconds=10, tries=5)
            self.game.print_grid()
            solutions.append({ 
                "slots": [{ 
                    "id": s.id,
                    "coord":s.coord, 
                    "num": s.num, 
                    "word": s.word, 
                    } for s in game.slots] 
                })
            self.game = copy.deepcopy(base)

        return solutions

    def solve_timeout(self, seconds: int, tries: int=5):
        base = copy.deepcopy(self.game)
        for t in range(tries):
            self.game = copy.deepcopy(game)

            self.deadline = time.perf_counter() + seconds
            try:
                ok = self._backtrack()
                if ok:
                    return True
            except TimeoutError:
                continue
            finally:
                self.deadline = None
        return False

    def _backtrack(self) -> bool:

        if self.deadline is not None and time.perf_counter() >= self.deadline:
            raise TimeoutError

        if self.game.done: 
            return True

        cands, slot = self._find_mrv()
        if slot is None or not cands:
            return False
        
        old_fits = None if slot.fits is None else slot.fits.copy()
        slot.fits = cands.copy()

        try: 
            lcv = []
            for w in cands:
                score = self._cross_cands(slot, w)
                if score != -1: 
                    lcv.append((score, w))

            random.shuffle(lcv)
            lcv.sort(key=lambda t: t[0], reverse=True)

            for _, word in lcv:
                changes = self._place(word, slot)

                if changes is None:
                    continue            

                if self._backtrack():
                    return True

                self._unplace(slot, changes)

            return False


        finally:
            slot.fits = old_fits

    def _find_mrv(self):
        best_slot = None
        best_cands = None
        best = []
        best_count = inf

        for s in self.game.slots:
            if s.word:
                continue

            population = s.fits or []
            if not population:
                return [], s

            pattern = self._slot_pattern(s)
            cands = self._cands_for_pattern(pattern)
            cands = (s.fits & cands) - self.game.words

            if not cands:
                return set(), s

            if len(cands) < best_count:
                best_count = len(cands)
                best = [(s, cands)]
                if best_count == 1:
                    break
            elif len(cands) == best_count:
                best.append((s, cands))

        if not best:
            return set(), None
        
        slot, cands = random.choice(best)
        return cands, slot

    def _unplace(self, slot: Slot, changes: dict):
        for s, old_fits in reversed(changes["fits"]):
            s.fits = old_fits

        for r, c, ch in reversed(changes["cells"]):
            self.game.grid[r] = self.game.grid[r][:c] + ch + self.game.grid[r][c + 1:]

        slot.word = changes["old"]
        self.game.words.remove(changes["placed"])

    def _place(self, word: str, slot):
        if not self._word_fits(word, slot):
            return None

        grid = self.game.grid
        changes = {"cells": [], "fits": [], "old": slot.word, "placed": word}

        slot.word = word
        self.game.words.add(word)

        seen = set() 

        r, c = slot.coord
        for i, ch in enumerate(word):
            rr, cc = (r+i, c) if slot.id[0] == 'D' else (r, c+i)

            if grid[rr][cc] == '.':
                changes["cells"].append((rr, cc, '.'))

            grid[rr] = grid[rr][:cc] + ch + grid[rr][cc+1:]

            s2 = self._crossing_slot_at(rr, cc, slot.id[0])
            if not s2 or s2.word:
                continue

            if id(s2) in seen:
                continue
            seen.add(id(s2))

            old = s2.fits
            new = {w for w in old if self._word_fits(w, s2)}
            if len(new) != len(old):
                changes["fits"].append((s2, old))
                s2.fits = new

            if not s2.fits:
                self._unplace(slot, changes)
                return None

        return changes

    def _cross_cands(self, slot, word):

        # TODO: change fill and empty algorithm, use the char and see what happens

        chgs = self._fill_word(word, slot)
        try:
            grid = self.game.grid
            acc = 0
            
            for i in range(slot.num):
                r, c = slot.coord
                if slot.id[0] == "D":
                    while c > 0 and grid[r+i][c-1] != '#': 
                        c-=1
                    s = next((s for s in self.game.slots if s.coord == (r+i,c) and s.id[0] == "H"), None)
                else:
                    while r > 0 and grid[r-1][c+i] != '#': 
                        r-=1
                    s = next((s for s in self.game.slots if s.coord == (r,c+i) and s.id[0] == "D"), None)

                if s is None:
                    continue
                if s.word:
                    continue
                
                pattern = self._slot_pattern(s)
                cands = self._cands_for_pattern(pattern)
                count = len((cands & s.fits) - self.game.words)

                if count == 0:
                    return -1
                
                acc += count 

            return acc

        finally:    
            self._empty_word(slot, chgs)

    def _cands_for_pattern(self, pattern: str):
            L = len(pattern)

            if '?' not in pattern:
                return {pattern} if pattern in self.bylen.get(L, set()) else set()

            fixed = [(i, ch) for i, ch in enumerate(pattern) if ch != '?']
            if not fixed:
                return self.bylen.get(L, set()).copy()

            i0, ch0 = fixed[0]
            cand = set(self.index[L][i0].get(ch0, set()))
            for i, ch in fixed[1:]:
                cand &= self.index[L][i].get(ch, set())
                if not cand:
                    break
            return cand

    def _crossing_slot_at(self, r: int, c: int, placed_dir: str):
        grid = self.game.grid
        perp = 'H' if placed_dir == 'D' else 'D'

        if perp == 'H':
            cc = c
            while cc > 0 and grid[r][cc-1] != '#':
                cc -= 1
            start = (r, cc)
        else:
            rr = r
            while rr > 0 and grid[rr-1][c] != '#':
                rr -= 1
            start = (rr, c)

        return next((s for s in self.game.slots if s.coord == start and s.id[0] == perp), None)

    def _slot_pattern(self, slot):
        grid = self.game.grid
        r, c = slot.coord
        out = []
        if slot.id[0] == 'D':
            for i in range(slot.num): 
                ch = grid[r+i][c]
                out.append('?' if ch == '.' else ch)
        else:
            row = grid[r]
            for i in range(slot.num):
                ch = row[c+i]
                out.append('?' if ch == '.' else ch)
        return ''.join(out)

    def _word_fits(self, word: str, slot) -> bool:
        if word in self.game.words: 
            return False

        if len(word) != slot.num:
            return False

        grid = self.game.grid
        r, c = slot.coord
        dirc = slot.id[0]
        
        if dirc == 'D':
            for i in range(slot.num):
                cell = grid[r+i][c]
                if cell == '#':
                    return False
                ch = word[i]
                if cell != '.' and cell != ch:
                    return False
            return True
     
        row = grid[r]
        for i in range(slot.num):
            cell = row[c+i]
            if cell == '#':
                return False
            ch = word[i]
            if cell != '.' and cell != ch:
                return False
        return True
    
    def _start_slots(self):
        for s in self.game.slots:
            s.fits = self.bylen[s.num].copy()
    
    def _empty_word(self, slot, changes):
        self.game.words.remove(slot.word)
        slot.word = ""
        for c in changes:
            for r, c in c:
                self.game.grid[r] = self.game.grid[r][:c] + '.' + self.game.grid[r][c+1:]

    def _fill_word(self, word, slot):
        slot.word = word
        self.game.words.add(word)
        r, c = slot.coord
        changes = []
        if slot.id[0] == 'D':
            for i, ch in enumerate(word):
                char = self.game.grid[r+i]
                if char == '.':
                    changes.append({(r+i, c):ch})
                char = char[:c] + ch + char[c+1:]
        else:
            row = self.game.grid[r]
            for i, ch in enumerate(word):
                if row[c+i] == '.':
                    changes.append({(r, c+i):ch})
                row = row[:c+i] + ch + row[c+i+1:]
        slot.change = changes
        return changes


class WordsJson:
    def __init__(self, path: str="data/jsons/words.json"):
        self.path  = path  
        self.words = self.read_json()
        self.bylen = self.flatten_words()
        self.index = self.build_index()

    def read_json(self, report=False):
        try:
            with open(self.path, 'r') as file:
                words = json.load(file)
            if report:
                total = 0
                for x, obj in words.items():
                    print("letters: " + str(x))
                    for x1, obj1 in obj.items():
                        print(" level:"+x1)
                        print("     "+str(len(obj1))+" words")
                        total += len(obj1)
                print("total of " + str(total) + " words")
        except Exception as e:
            print(type(e).__name__, e)

        return words

    def build_index(self) -> dict[int, list[dict[str, set[str]]]]:
        index = {}
        for length, words in self.bylen.items():
            pos = [defaultdict(set) for _ in range(length)]
            for w in words:
                for i, ch in enumerate(w):
                    pos[i][ch].add(w)
            index[length] = pos
        return index

    def flatten_words(self) -> dict[int, set[str]]:
        bylen: dict[int, set[str]] = {}
        for L_str, diffs in self.words.items():
            acc: set[str] = set()
            for lst in diffs.values():
                acc.update(lst)
            bylen[int(L_str)] = acc
        return bylen


def create_template_json():
    numbers = [5,7,8,10,15]
    slots = []
    for n in numbers:
        g = Game(n)
        slots.append([{"id":l.id, 'size':l.num, 'coord':l.coord, 'cells':l.cells} for l in g.slots])

    with open("data/jsons/tmpl.json", 'r') as file:
        data = json.load(file)

    for i in range(len(slots)):
        data['templates'][i]['slots'] = slots[i]
         
    with open("data/jsons/tmpl.json", 'w') as file:
        json.dump(data, file, ensure_ascii=False, indent=1)
"""
if __name__ == "__main__":
    words = WordsJson()
    game = Game(size=15)
    solver = CwSolver(game, words)
    payload = solver.solve_n(2)

    try:
        with open("data/jsons/sols.json",  "w", encoding="utf-8") as file:
            json.dump(payload, file, ensure_ascii=False, indent=1)
    except Exception:
        raise
"""

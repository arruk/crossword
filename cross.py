from dataclasses import dataclass, field
from collections import defaultdict
from fnmatch import fnmatchcase
from math import inf
import json
import random

@dataclass
class Slot:
    id:     str = ""
    coord:  tuple[int,int] = (0,0)
    num:    int = 0
    word:   str = ""
    change: dict[tuple[int, int], str] | None = None
    fits:   set[str] = field(default_factory=set)

@dataclass
class Game:
    size: int = 10
    grid: list[str]     = field(default_factory=list)
    words: set[str]    = field(default_factory=set)
    slots: list["Slot"] = field(default_factory=list)
    
    @property
    def done(self) -> bool:
        return bool(self.slots) and all(s.word for s in self.slots)

def read_json(path, report=False):
    try:
        with open(path, 'r') as file:
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

def build_index(bylen: dict[int, set[str]]):
    index = {}
    for L, words in bylen.items():
        pos = [defaultdict(set) for _ in range(L)]
        for w in words:
            for i, ch in enumerate(w):
                pos[i][ch].add(w)
        index[L] = pos
    return index

def flatten_words(words_json: dict) -> dict[int, set[str]]:
    bylen: dict[int, set[str]] = {}
    for L_str, diffs in words_json.items():
        acc: set[str] = set()
        for lst in diffs.values():
            acc.update(lst)
        bylen[int(L_str)] = acc
    return bylen

templates = [
        [
        "#...#",
        ".....",
        ".....",
        ".....",
        "#...#",
        ],
        [
        "##...##",
        "#.....#",
        ".......",
        "...#...",
        ".......",
        "#.....#",
        "##...##",
        ],
        [
        "##....##",
        "#......#",
        "........",
        "....#...",
        "...#....",
        "........",
        "#......#",
        "##....##",
        ]
            ]

words_filename = "data/jsons/words.json"
words = read_json(words_filename)
template = templates[1]           
bylen = flatten_words(words)
index = build_index(bylen)
#            [ 
#            "###....###",
#            "##......##",
#            "#........#",
#            "......#...",
#            ".....#....",
#            "....#.....",
#            "...#......",
#            "#........#",
#            "##......##",
#            "###....###" 
#            ]

def slots_down(template, r, c):
    count = 0
    while template[r+count][c] != '#':
        count += 1
        if len(template) == r+count: return count
    return count

def slots_horz(template, r, c):
    count = 0
    while template[r][c+count] != '#':
        count += 1
        if len(template[r]) == c+count: return count
    return count

def print_template(template):
    for r in range(len(template)):
        for c in range(len(template[0])):
            print(f"{template[r][c]}", end="")
        print("")

def first_char(template, r, c, dir):
    match dir:
        case "down":
            return (r > 0 and template[r-1][c] == '#') or (r == 0)
        case "horz":
            return (c > 0 and template[r][c-1] == '#') or (c == 0)

def get_slots(template, bylen: dict[int, set[str]]):
    slots = []
    slot_num = 1
    for r in range(len(template)):
        for c in range(len(template[0])):
            if template[r][c] == '#':
                continue

            num_d = slots_down(template, r, c)
            num_h = slots_horz(template, r, c)
            cond = False

            if num_d > 2 and first_char(template, r, c, "down"):
                p = Slot("D" + str(slot_num), (r, c), num_d)
                p.fits = bylen.get(num_d, set()).copy()
                slots.append(p)
                cond = True

            if num_h > 2 and first_char(template, r, c, "horz"):
                p = Slot("H" + str(slot_num), (r, c), num_h)
                p.fits = bylen.get(num_h, set()).copy()
                slots.append(p)
                cond = True

            if cond:
                slot_num += 1

    return slots


def word_fits(word: str, slot, game) -> bool:
    if word in game.words: 
        return False

    if len(word) != slot.num:
        return False

    grid = game.grid
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

def empty_grid(game: Game, template: list[str]):
    for s in game.slots:
        s.word = ""
    game.words.clear()
    game.grid = template.copy()

def empty_word(game, slot, changes):
    grid = game.grid
    game.words.remove(slot.word)
    slot.word = ""
    for c in changes:
        for coord in c:
            r, c = coord
            grid[r] = grid[r][:c] + '.' + grid[r][c+1:]

def fill_word(game, word, slot):
    grid = game.grid
    slot.word = word
    game.words.add(word)
    r, c = slot.coord
    changes = []
    match slot.id[0]:
        case "D":
            for i in range(len(word)):
                if grid[r+i][c] == '.': changes.append({(r+i,c):word[i]})
                grid[r+i] = grid[r+i][:c] + word[i] + grid[r+i][c+1:]
        case "H":
            for i in range(len(word)):
                if grid[r][c+i] == '.': changes.append({(r,c+i):word[i]})
                grid[r] = grid[r][:c+i] + word[i] + grid[r][c+i+1:]

    slot.change = changes
    return changes

def crossing_slot_at(game, r: int, c: int, placed_dir: str):
    grid = game.grid
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

    return next((s for s in game.slots if s.coord == start and s.id[0] == perp), None)

def slot_pattern(game, slot):
    grid = game.grid
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

def unplace(game: Game, slot: Slot, changes: dict):
    for s, old_fits in reversed(changes["fits"]):
        s.fits = old_fits

    for r, c, ch in reversed(changes["cells"]):
        game.grid[r] = game.grid[r][:c] + ch + game.grid[r][c + 1:]

    slot.word = changes["old"]
    game.words.remove(changes["placed"])

def place(game, word: str, slot):
    if not word_fits(word, slot, game):
        return None

    grid = game.grid
    changes = {"cells": [], "fits": [], "old": slot.word, "placed": word}

    slot.word = word
    game.words.add(word)

    seen = set()  # evita podar o mesmo slot 2x nesta jogada

    r, c = slot.coord
    for i, ch in enumerate(word):
        rr, cc = (r+i, c) if slot.id[0] == 'D' else (r, c+i)

        if grid[rr][cc] == '.':
            changes["cells"].append((rr, cc, '.'))

        grid[rr] = grid[rr][:cc] + ch + grid[rr][cc+1:]

        s2 = crossing_slot_at(game, rr, cc, slot.id[0])
        if not s2 or s2.word:
            continue

        if id(s2) in seen:
            continue
        seen.add(id(s2))

        old = s2.fits
        new = [w for w in old if word_fits(w, s2, game)]
        if len(new) != len(old):
            changes["fits"].append((s2, old))
            s2.fits = new

        if not s2.fits:
            unplace(game, slot, changes)
            return None

    return changes

def build_words_bylen(words: dict) -> dict[int, list[str]]:
    words_bylen: dict[int, list[str]] = {}
    for key, value in words.items():
        try:
            L = int(key)
        except Exception:
            continue

        if not isinstance(value, dict):
            continue
        
        allw = value.get("easy", []) + value.get("medium", []) + value.get("hard", [])
        level = random.sample(allw, k=min(1000, len(allw)))

        if isinstance(level, dict):
            level = list(level.keys())
        else:
            level = list(level)

        words_bylen[L] = level
    return words_bylen



def cands_for_pattern(pattern: str, bylen: dict[int, set[str]], index):
    L = len(pattern)

    if '?' not in pattern:
        return {pattern} if pattern in bylen.get(L, set()) else set()

    fixed = [(i, ch) for i, ch in enumerate(pattern) if ch != '?']
    if not fixed:
        return bylen.get(L, set()).copy()

    i0, ch0 = fixed[0]
    cand = set(index[L][i0].get(ch0, set()))
    for i, ch in fixed[1:]:
        cand &= index[L][i].get(ch, set())   # <- era ch0 (bug)
        if not cand:
            break
    return cand

def match_qmark(word: str, pattern: str) -> bool:
    if len(word) != len(pattern):
        return False
    return all(p == '?' or p == w for p, w in zip(pattern, word))

def cross_cands(game, slot, word):

    chgs = fill_word(game, word, slot)
    try:
        grid = game.grid
        acc = 0
        
        for i in range(slot.num):
            pattern = []
            r, c = slot.coord
            if slot.id[0] == "D":

                while c > 0 and grid[r+i][c-1] != '#': 
                    c-=1

                s = next((s for s in game.slots if s.coord == (r+i,c) and s.id[0] == "H"), None)
                while c < len(grid[r]) and grid[r+i][c] != '#':
                    pattern.append('?' if grid[r+i][c] == '.' else grid[r+i][c])
                    c+=1
            else:
                while r > 0 and grid[r-1][c+i] != '#': 
                    r-=1
                
                s = next((s for s in game.slots if s.coord == (r,c+i) and s.id[0] == "D"), None)
                while r < len(grid) and grid[r][c+i] != '#':
                    pattern.append('?' if grid[r][c+i] == '.' else grid[r][c+i])
                    r+=1

            if s is None:
                continue
            
            pattern = ''.join(pattern)

            cands = s.fits
            if not cands:
                return -1

            #cand = cands_for_pattern(pattern, bylen, index)
            #count = len(cand - set(game.words))

            count = 0
            for w in cands:
                if match_qmark(w, pattern):
                    count += 1

            if count == 0:
                return -1
            
            acc += count 

        return acc

    finally:    
        empty_word(game, slot, chgs)


def find_mrv(game: Game, bylen, index):
    best_slot = None
    best_cands = None
    best_count = inf

    for s in game.slots:
        if s.word:
            continue

        population = s.fits or []
        if not population:
            return [], s

        cands = [w for w in population if word_fits(w, s, game)]

        #pattern = slot_pattern(game, s)
        #cand = cands_for_pattern(pattern, bylen, index)
        #cand = (s.fits & cand) - game.words
        #s.fits = cand  # mantém podado

        if not cands:
            return set(), s

        if len(cands) < best_count:
            best_count = len(cands)
            best_slot = s
            best_cands = cands
            if best_count == 1:
                break

    return best_cands or set(), best_slot

def backtrack(game, words):
    if game.done: return True

    cands, slot = find_mrv(game, bylen, index)
    if slot is None or not cands:
        return False
    
    old_fits = None if slot.fits is None else slot.fits.copy()
    slot.fits = cands.copy()

    try: 
        lcv = []
        cands_list = list(cands)
        random.shuffle(cands_list)
        for w in cands_list:
            score = cross_cands(game, slot, w)
            if score != -1: 
                lcv.append((score, w))

        lcv.sort(key=lambda t: t[0], reverse=True)

        for _, word in lcv:
            #changes = fill_word(game, word, slot)
            changes = place(game, word, slot)
            if changes is None:
                continue            
            if backtrack(game, words):
                return True
            #empty_word(game, slot, changes)
            unplace(game, slot, changes)

        return False


    finally:
        slot.fits = old_fits

words_bylen = build_words_bylen(words)

game = Game(size=10)
game.slots = get_slots(template, bylen)
game.grid = template.copy()

words = game.slots[0].fits
words_len = len(words)

print(backtrack(game, bylen))
print_template(game.grid)

from dataclasses import dataclass, field
from fnmatch import fnmatchcase
from math import inf
import json
import random

@dataclass
class Slot:
    id: str = ""
    coord: tuple[int,int] = (0,0)
    num: int = 0
    word: str = ""
    change: dict[tuple[int, int], str] | None = None

@dataclass
class Game:
    grid: list[str] = field(default_factory=list)
    size: int = 10
    words: list[str] = field(default_factory=list)
    slots_done: int = 0

words_filename = "data/jsons/words.json"
template = [ 
            "###....###",
            "##......##",
            "#........#",
            "......#...",
            ".....#....",
            "....#.....",
            "...#......",
            "#........#",
            "##......##",
            "###....###" 
            ]

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

def get_slots(template):
    slots = []
    slot_num = 1
    for r in range(len(template)):
        for c in range(len(template[0])):
            if template[r][c] != '#':
                num_d = slots_down(template, r, c)
                num_h = slots_horz(template, r, c)
                cond = False
                if num_d > 2 and first_char(template, r, c, "down"): 
                    p = Slot("D" + str(slot_num), (r,c), num_d)
                    slots.append(p)
                    cond = True

                if num_h > 2 and first_char(template, r, c, "horz"): 
                    p = Slot("H" + str(slot_num), (r,c), num_h)
                    slots.append(p)
                    cond = True

                if cond:
                    slot_num+=1
    return slots

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


def word_fits(word, slot, game):
    if word in game.words: return 0
    grid = game.grid
    r, c = slot.coord
    num = slot.num
    match slot.id[0]:
        case 'D':
            for row in range(len(word)):
                if (grid[r+row][c] != word[row]) and \
                   (grid[r+row][c] != '.')       or  \
                   (grid[r+row][c] == '#'):
                       return 0
        case 'H':
            for col in range(len(word)):
                if (grid[r][c+col] != word[col]) and \
                   (grid[r][c+col] != '.')        or  \
                   (grid[r][c+col] == '#'):
                       return 0
    return 1

def fill_word(game, word, slot):
    grid = game.grid
    slot.word = word
    game.words.append(word)
    game.slots_done += 1
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

def empty_word(game, slot, changes):
    grid = game.grid
    game.words.remove(slot.word)
    game.slots_done -= 1
    slot.word = ""
    for c in changes:
        for coord in c:
            r, c = coord
            grid[r] = grid[r][:c] + '.' + grid[r][c+1:]

def find_least(game, slots, words):
    best_count = inf
    best_slot = None
    best_word = ""

    for s in slots:
        if s.word != "":
            continue

        population = list(words.get(str(s.num), {}).get("easy", []))
        if not population:
            continue

        fittable = []
        count = 0

        for w in random.sample(population, k=min(200, len(population))):
            if word_fits(w, s, game):
                fittable.append(w)
                count+=1
                if count >= best_count:
                    break
        if 0 < count < best_count:
            best_count = count
            best_slot  = s
            best_word  = random.choice(fittable)

    return best_word, best_slot

    """
    least = least_c = float('inf')
    least_w = acpt_w = ""
    least_s = acpt_s = Slot()
    for s in slots:
        if s.word != "": continue
        poss = cross = 0
        fittable = []
        w = words.get(str(s.num)).get("easy")
        w_f = random.sample(list(w), k=min(200, len(w)))
        for word in w_f:                          
            fits = word_fits(word, s, game) 
            poss += fits
            if fits: fittable.append(word)
            if poss == least: break
        if poss < least and poss > 0:
            least = poss
            least_w = random.choice(fittable)
            least_s = s
    print(f"word = {least_w}, slot = {least_s.coord}, least_c = {least_c}")
    return least_w, least_s
    """

def fill_grid(game, slots, words):
    least_w, least_s = find_least(game, slots, words)
    #while least_w != "":
    for _ in range(5):
        fill_word(game, least_w, least_s)
        least_w, least_s = find_least(game, slots, words)

def empty_grid(grid, slots, template):
    for s in slots:
        s.word = ""
    grid = template.copy()

def cross_cands(game, words, slot, word):
    grid = game.grid
    chgs = fill_word(game, word, slot)
    least_cands = float('inf')

    for i in range(len(slot.word)):
        pattern = ""
        r, c = slot.coord

        match slot.id[0]:
            case "D":
                while c > 0 and grid[r+i][c-1] != '#': c-=1
                while c < len(grid)-1 and grid[r+i][c] != '#':
                    pattern += '?' if grid[r+i][c] == '.' else grid[r+i][c]
                    c+=1

            case "H":
                while r > 0 and grid[r-1][c+i] != '#': r-=1
                while r < len(grid)-1 and grid[r][c+i] != '#':
                    pattern += '?' if grid[r][c+i] == '.' else grid[r][c+i]
                    r+=1

        try:
            cands = words.get(str(len(pattern))).get("easy")
        except:
            cands = {}
        sample = cands#random.sample(list(cands), k=min(400, len(cands)))
        filtered = [w for w in sample if fnmatchcase(w, pattern)]

        if len(filtered) < least_cands: 
            least_cands = len(filtered)

    empty_word(game, slot, chgs)
    return least_cands

print_template(template)
slots = get_slots(template)
words = read_json(words_filename)
game = Game(size=10)
game.grid = template.copy()
#grid = template.copy()

fill_grid(game, slots, words)


#s = slots[0]
#print(s)
#s.word = "TINTAR"
#least_cands = cross_cands(grid, words, s)
for s in slots:
    if s.word != "": print(s.word)

print_template(game.grid)


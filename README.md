# Carley's World

A cosy browser game where you look after Carley, a tiny chibi girl living in a two-storey cottage with a garden - and Pongo, her very good dalmatian puppy.

## Run it

```
npm install --ignore-scripts   # (plain `npm install` also works on most machines)
npm run dev                    # then open the printed URL (usually http://localhost:5173)
npm test                       # automated tests (meters, commands, stairs, player control, the dog, save/load)
npm run build                  # type-check + production build into dist/
```

## How to play

You walk Carley around yourself.

| Key | Does |
| --- | --- |
| **← →** | walk (hold **Shift** to run) |
| **↑** | at the foot of the stairs: climb them (hold it) |
| **↓** | at the top of the stairs: go back down (walking on to the right off the edge does the same) |
| **Space** | do the thing you are standing next to - or stop what Carley is doing |
| **A** | autopilot: Carley chooses for herself (press again to take over) |
| **P** / Esc | pause |
| **F3** | debug panel |

Carley has six meters: **Rest, Fun, Social, Relax, Garden, Tummy**. They drain slowly and only fill while she is doing
something that feeds them. Her **Happy** meter is the weighted sum of all of them (pain and irritation subtract from it).
Keep her happy - and keep the *Happy streak* going.

Walk up to something and a little box shows what Space will do (and what it feeds, or why it can't be done right now):

| Where | Press Space to... | Feeds |
| --- | --- | --- |
| upstairs, the bed | Sleep | Rest |
| upstairs, telephone table | Call Sister | Social |
| either window | Look out of the window | Relax |
| downstairs, the fridge | Drink Milk (she fetches it herself) | Tummy |
| downstairs, the easel | Paint (the canvas fills in as she paints) | Fun |
| downstairs, the armchair | Read | Fun (+Relax) |
| garden, flowerbed | Garden (needs daylight, no rain) | Garden |
| garden, blanket | Sunbathe (needs real sunshine) | Relax |
| next to Pongo | **Indoors:** Pet Pongo (he rolls over for a belly rub, which also soothes aches). **Outdoors:** Play fetch | Social |

The cottage has two floors: the bedroom (with the bed, a window and the phone) is upstairs over the kitchen, and the only way
between them is the staircase.

### Pongo

Pongo does his own thing - wanders, sniffs, naps in his bed (or beside Carley's bed), zooms about - and sometimes follows
Carley around or sits at her feet begging for a fuss. He also guards her: when mosquitoes bother her in the garden he barks at
them and jumps to snap them out of the air (and Carley cheers). He is quite fond of butterflies too.

The weather, mosquitoes, butterflies and little accidents still happen on their own.

## Project layout

`src/config` tuning (meters, activities, world layout, where you can interact) - `src/systems` simulation (needs, mood, brain,
player control, dog brain, weather, audio, save) - `src/entities` bodies (Carley, the dog, the ball, insects, plants) -
`src/activities` activity scripts - `src/render` Phaser drawing - `src/ui` HUD - `tests` Vitest suites.

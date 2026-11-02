# cycle

A private, local-only period tracker. One user, one phone, no account, no network.

The point is not to predict better than the big apps. The point is to be honest about the range, keep the data on the device, and make logging cost two taps.

Built on [Foldkit](https://foldkit.dev) (Elm architecture) and Effect.

## Run it

```bash
nub install
nub run dev      # http://localhost:5173
nub run check    # typecheck, tests, lint, build
```

## What it does

- Three sections — Today, History, About — sit in a bar at the bottom of a phone screen, where a thumb reaches them. On a wide window the same row moves back under the heading.
- Tap any day in the month calendar and say what it was: bleeding, or spotting. A logged day offers `Clear this day`.
- Forgot a few days? Tap one end of the run, `Mark a range`, tap the other end, and one confirm writes every day between.
- Periods are derived from those days, not from a start/end form. A bleeding day starts a new period only after two clear days, and spotting never starts one.
- The next period is shown as a date range, never a single date, with a confidence word.
- If the cycle runs past its range the app asks a question instead of showing a red day counter.
- Everything is stored in `localStorage` on the device.

Not in scope, on purpose: ovulation, fertile windows, contraception claims, accounts, analytics, notifications, streaks.

## The prediction

`packages/domain/src/predict.ts`. No training, no model file. Roughly:

1. Cycle lengths are the gaps between period starts, keeping 15–90 days and dropping the rest as mis-entries.
2. With 6 or more cycles, the centre is the median of the last 6. Fewer than 3 uses her own mean pulled toward a 29 day prior; 3 to 5 uses the median but with an inflated spread.
3. The spread is her own standard deviation, floored at 2.3 days and inflated for small samples.
4. The window is centre ± 1.28 × spread, about the 80% band, rounded outward to dates.
5. While the cycle is running, the estimate is conditioned on "it has not started yet", so it slides forward by less than a day for each day late.
6. Past the window, the state becomes `Overdue` and the UI stops predicting.

The shipped prior is deliberately wider than the dataset below (4 days for a cold start, 2.3 as a floor once she has data). App users are messier than the volunteers in a fertility study: the Apple Women's Health Study reports per-person spread around 4.7 days for people in their twenties. Under-promising is the point.

## Scoring

```bash
nub run dataset   # downloads the Marquette/Fehring cycle data into data/ (gitignored)
nub run score
```

That is the same predictor the app uses, backtested on 1,490 real cycle-to-cycle pairs from 159 women. Each cycle is predicted from the cycles before it only.

```
method                                     n     MAE  medAE     ±1     ±2     ±3  80% band
always 29 (no personal data)            1490     2.83     2.0   35.0%   54.7%   72.6%         —
mean of last 3 (Mooneva)                1211     2.25     1.7   39.5%   63.0%   76.7%         —
mean of last 5 (Mensinator)             1346     2.17     1.5   38.8%   63.4%   77.0%         —
mean of all previous (drip)             1211     2.14     1.5   37.4%   63.2%   76.4%         —
median of last 6                        1490     2.22     1.5   45.7%   68.1%   78.1%         —
app: median6 + prior + spread           1490     2.19     2.0   49.7%   69.4%   80.1%     89.4%
floor: oracle with her whole history    1506     1.82     1.0      —       —       —           —
```

Three things worth taking from that table:

- Every sane method is within a tenth of a day of every other one. The algorithm is not where accuracy comes from after three cycles.
- The oracle row is the ceiling: even a model that already knew each woman's full-history median would score 1.82 days, because the rest is the spread of her own cycles. The 0.37 day gap to the app is all that better maths could win.
- A fixed 28 or 29 day guess is clearly worse, so the win is using her own data at all.
- The 80% band covers 89% here. That is intentional: a range one day too wide is fine, a range one day too narrow is the app being confidently wrong.

The literature agrees that the model is not the lever. On 2 million Clue cycles, a hierarchical model beat the median baseline by 0.1 day at the start of a cycle, while CNN, RNN and LSTM baselines did no better than the median ([Li et al., JAMIA 2022](https://doi.org/10.1093/jamia/ocab182)); most of its gain came after the typical cycle length had passed, by modelling **missed logs**, which this app handles as a question instead. The per-woman spread of 2.6 days measured across 612,613 Natural Cycles cycles ([Bull et al., npj Digital Medicine 2019](https://doi.org/10.1038/s41746-019-0152-7)) puts the same floor under any predictor that only sees dates.

Underneath, the interesting number is what happens while a cycle is open: at the estimated date, 54% of cycles still had not started, and among those the app is within two days 80% of the time.

## Data

`data/marquette-cycles.csv` comes from the Marquette University natural family planning study ([Fehring 2012](https://epublications.marquette.edu/data_nfp/7)), downloaded from a public mirror. It is anonymised and consented for reuse, but not openly licensed, so it stays out of git and is for local scoring only.

## Layout

```
apps/web/                  the Vite app: runtime boot, Model/Message/update/view
apps/web/src/theme.css     design tokens: light-dark() colours, fonts, base styles
apps/web/src/components/ui styled @foldkit/ui components, owned by the app
packages/domain/           date keys, period grouping, predictor, scoring
```

`packages/domain` has no Foldkit or DOM dependency, so the scoring CLI and the app run the exact same estimator.

## The look

Monochrome and typographic, borrowed from [my site](https://github.com/ericc-ch/ericc-ch.github.io) (`docs/DESIGN.md`): `light-dark()` tokens, Plus Jakarta Sans with JetBrains Mono for dates, a fluid type ladder, a 4px grid, a 50ch measure, no radius, no shadow, no motion.

The mono face is loaded and its token (`font.mono`) is still there, but every surface currently uses Plus Jakarta Sans. Switch a style over when dates or code should get the second face back.

There is no accent colour. Flow is encoded in ink: spotting is a hairline, bleeding is a full-ink bar. State lives in text, never in colour alone.

Behaviour comes from [@foldkit/ui](https://foldkit.dev/ui/overview): the ARIA roles, keyboard handling, focus management and submodel state are the library's. The styled wrappers in `apps/web/src/components/ui` only supply the markup and the StyleX styles each component renders through its `toView` hook.

"use client";

import { useEffect, useMemo, useState } from "react";

import { CURATED_OPENINGS } from "@/lib/curated-openings";

export type OpeningEntry = {
  eco: string;
  moves: string;
  name: string;
};

type OpeningBookData = Record<string, OpeningEntry>;

type FamilyStats = {
  count: number;
  ecoCounts: Map<string, number>;
  example: OpeningEntry;
  variationCounts: Map<string, number>;
};

type PrefixStats = {
  families: Map<string, FamilyStats>;
  total: number;
};

type OpeningBookIndex = {
  byPosition: Map<string, OpeningEntry>;
  bySequence: Map<string, OpeningEntry>;
  curatedSequences: Map<string, OpeningEntry>;
  theorySequences: Set<string>;
};

export type OpeningMatch = {
  entry: OpeningEntry;
  index: number;
};

const FAMILY_ALIASES: Record<string, string> = {
  "Alekhine": "Alekhine Defense",
  "Bird's Opening": "Bird's Opening",
  "Bogo-Indian": "Bogo-Indian Defense",
  "Benoni": "Benoni Defense",
  "Blackmar-Diemer Gambit Accepted": "Blackmar-Diemer Gambit",
  "Blackmar-Diemer Gambit Declined": "Blackmar-Diemer Gambit",
  "Budapest": "Budapest Gambit",
  "Caro-Kann": "Caro-Kann Defense",
  "Dutch": "Dutch Defense",
  "Englund Gambit Declined": "Englund Gambit",
  "English": "English Opening",
  "French": "French Defense",
  "Grob": "Grob Opening",
  "Grob Gambit": "Grob Opening",
  "Gruenfeld": "Grünfeld Defense",
  "King's Indian": "King's Indian Defense",
  "King's Pawn": "King's Pawn Game",
  "Latvian Gambit Accepted": "Latvian Gambit",
  "Modern": "Modern Defense",
  "Nimzo-Indian": "Nimzo-Indian Defense",
  "Owen Defence": "Owen's Defense",
  "Pirc": "Pirc Defense",
  "Polish": "Polish Opening",
  "Petrov's Defense": "Petrov's Defense",
  "QGA": "Queen's Gambit Accepted",
  "QGD": "Queen's Gambit Declined",
  "Queen's Indian": "Queen's Indian Defense",
  "Queen's Pawn": "Queen's Pawn Game",
  "Reti": "Réti Opening",
  "Richter-Veresov": "Richter-Veresov Attack",
  "Scandinavian": "Scandinavian Defense",
  "Scotch": "Scotch Game",
  "Scotch Gambit": "Scotch Game",
  "Semi-Slav": "Semi-Slav Defense",
  "Sicilian": "Sicilian Defense",
  "Slav": "Slav Defense",
  "Torre Attack": "Torre Attack",
  "Trompowsky": "Trompowsky Attack",
};

const VARIATION_ALIASES: Record<string, string> = {
  "Three Knights": "Three Knights Variation",
};

function positionKey(fen: string) {
  return fen.split(" ").slice(0, 4).join(" ");
}

function moveTokens(moveText: string) {
  return moveText
    .replace(/\d+\.(?:\.\.)?/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function canonicalFamily(name: string) {
  const family = name.split(/[:,]/)[0]?.trim() ?? name;
  if (/^Sicilian(?: Defense)?(?:,|$)/.test(family) || family === "Smith-Morra Gambit") {
    return "Sicilian Defense";
  }
  if (
    family === "Spanish" ||
    family === "Morphy Defence" ||
    family.includes("Ruy Lopez")
  ) {
    return "Ruy Lopez";
  }
  if (
    family === "QGD" ||
    family === "Queen's Gambit Declined"
  ) {
    return "Queen's Gambit Declined";
  }
  if (family === "QGD Tarrasch" || family === "Tarrasch Defense") {
    return "Tarrasch Defense";
  }
  if (family === "KGA" || family === "King's Bishop Gambit Accepted") {
    return "King's Gambit Accepted";
  }
  if (family === "KGD") return "King's Gambit Declined";
  if (family.startsWith("Bogo-Indian")) return "Bogo-Indian Defense";
  if (family.startsWith("Blackmar-Diemer")) return "Blackmar-Diemer Gambit";
  if (family.startsWith("Budapest")) return "Budapest Gambit";
  if (family.startsWith("Englund")) return "Englund Gambit";
  if (family.startsWith("Grob")) return "Grob Opening";
  if (family.startsWith("Latvian Gambit")) return "Latvian Gambit";
  if (family.startsWith("Nimzo-Indian")) return "Nimzo-Indian Defense";
  if (family.startsWith("Polish")) return "Polish Opening";
  if (family.startsWith("Ponziani")) return "Ponziani Opening";
  if (family.startsWith("Semi-Slav")) return "Semi-Slav Defense";
  if (family.startsWith("Trompowsky")) return "Trompowsky Attack";
  return FAMILY_ALIASES[family] ?? family;
}

function canonicalVariation(name: string) {
  const variation = name
    .split(":")
    .slice(1)
    .join(":")
    .split(",")[0]
    ?.trim();
  if (!variation) return "";
  return VARIATION_ALIASES[variation] ?? variation;
}

function normalizedEntry(entry: OpeningEntry): OpeningEntry {
  if (entry.name === "King's Indian") {
    return { ...entry, name: "King's Indian Defense" };
  }
  if (entry.name.startsWith("King's Indian:")) {
    return {
      ...entry,
      name: `King's Indian Defense:${entry.name.slice("King's Indian:".length)}`,
    };
  }
  return entry;
}

function mostCommon(counts: Map<string, number>) {
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0] ?? null;
}

function requiredFamilyConfidence(plyCount: number, total: number) {
  if (total <= 2) return 0.5;
  if (plyCount <= 2) return 0.9;
  if (plyCount <= 4) return 0.76;
  if (plyCount <= 6) return 0.65;
  return 0.55;
}

function sequenceToPgn(sequence: string) {
  return sequence
    .split(" ")
    .map((move, index) => index % 2 === 0 ? `${Math.floor(index / 2) + 1}. ${move}` : move)
    .join(" ");
}

function synthesizeEntry(stats: PrefixStats, sequence: string) {
  const topFamily = [...stats.families.entries()]
    .sort((left, right) => right[1].count - left[1].count)[0];
  if (!topFamily) return null;

  const [family, familyStats] = topFamily;
  const plyCount = sequence.split(" ").length;
  if (familyStats.count / stats.total < requiredFamilyConfidence(plyCount, stats.total)) {
    return null;
  }

  const topVariation = mostCommon(familyStats.variationCounts);
  const variation = topVariation &&
    topVariation[1] >= 2 &&
    topVariation[1] / familyStats.count >= 0.6
    ? topVariation[0]
    : "";
  const topEco = mostCommon(familyStats.ecoCounts)?.[0] ?? familyStats.example.eco;

  return {
    eco: topEco,
    moves: sequenceToPgn(sequence),
    name: variation ? `${family}: ${variation}` : family,
  } satisfies OpeningEntry;
}

export function useOpeningBook(
  positions: string[],
  moves: string[],
  currentIndex: number,
) {
  const [book, setBook] = useState<OpeningBookIndex | null>(null);
  const [bookError, setBookError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function loadBook() {
      try {
        const response = await fetch("/data/eco_interpolated.json", {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Không thể tải từ điển ECO");

        const data = await response.json() as OpeningBookData;
        const byPosition = new Map<string, OpeningEntry>();
        const curatedSequences = new Map<string, OpeningEntry>(Object.entries(CURATED_OPENINGS));
        const exactSequences = new Map<string, OpeningEntry>();
        const prefixStats = new Map<string, PrefixStats>();
        const theorySequences = new Set<string>();

        Object.keys(CURATED_OPENINGS).forEach((sequence) => {
          const tokens = sequence.split(" ");
          tokens.forEach((_, index) => {
            theorySequences.add(tokens.slice(0, index + 1).join(" "));
          });
        });

        Object.entries(data).forEach(([fen, rawEntry]) => {
          const entry = normalizedEntry(rawEntry);
          const key = positionKey(fen);
          const existing = byPosition.get(key);
          if (!existing || entry.moves.length > existing.moves.length) {
            byPosition.set(key, entry);
          }

          const tokens = moveTokens(entry.moves);
          exactSequences.set(tokens.join(" "), entry);
          const family = canonicalFamily(entry.name);
          const variation = canonicalVariation(entry.name);

          tokens.forEach((_, index) => {
            const sequence = tokens.slice(0, index + 1).join(" ");
            theorySequences.add(sequence);
            const stats = prefixStats.get(sequence) ?? {
              families: new Map<string, FamilyStats>(),
              total: 0,
            };
            const familyStats = stats.families.get(family) ?? {
              count: 0,
              ecoCounts: new Map<string, number>(),
              example: entry,
              variationCounts: new Map<string, number>(),
            };

            stats.total += 1;
            familyStats.count += 1;
            familyStats.ecoCounts.set(entry.eco, (familyStats.ecoCounts.get(entry.eco) ?? 0) + 1);
            if (variation) {
              familyStats.variationCounts.set(
                variation,
                (familyStats.variationCounts.get(variation) ?? 0) + 1,
              );
            }
            stats.families.set(family, familyStats);
            prefixStats.set(sequence, stats);
          });
        });

        const bySequence = new Map<string, OpeningEntry>(exactSequences);
        prefixStats.forEach((stats, sequence) => {
          if (bySequence.has(sequence)) return;
          const synthesized = synthesizeEntry(stats, sequence);
          if (synthesized) bySequence.set(sequence, synthesized);
        });

        setBook({ byPosition, bySequence, curatedSequences, theorySequences });
      } catch {
        if (!controller.signal.aborted) setBookError(true);
      }
    }

    void loadBook();
    return () => controller.abort();
  }, []);

  const matches = useMemo(
    () => positions.map((fen, index) => {
      if (!book || index === 0) return null;
      const exactPosition = book.byPosition.get(positionKey(fen));
      const sequence = moves.slice(0, index).join(" ");
      // A move-order match is more precise than a position-only match. Several
      // openings transpose to the same board (notably the King's Indian,
      // English and Réti families), so using the FEN first can display the
      // wrong family even though the played sequence is in the dictionary.
      return book.curatedSequences.get(sequence) ?? book.bySequence.get(sequence) ?? exactPosition ?? null;
    }),
    [book, moves, positions],
  );

  const theoryPositions = useMemo(
    () => positions.map((fen, index) => {
      if (!book || index === 0) return false;
      const sequence = moves.slice(0, index).join(" ");
      return book.byPosition.has(positionKey(fen)) || book.theorySequences.has(sequence);
    }),
    [book, moves, positions],
  );

  const currentMatch = useMemo<OpeningMatch | null>(() => {
    for (let index = Math.min(currentIndex, matches.length - 1); index >= 0; index -= 1) {
      const entry = matches[index];
      if (entry) return { entry, index };
    }
    return null;
  }, [currentIndex, matches]);

  return {
    bookError,
    currentMatch,
    inBook: Boolean(theoryPositions[currentIndex]),
    isLoading: !book && !bookError,
    matches,
    theoryPositions,
  };
}

package com.chessanalysis.auth.review;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.chessanalysis.auth.game.entity.AnalyzedGame;
import com.chessanalysis.auth.game.entity.AnalyzedMove;
import com.chessanalysis.auth.game.repository.AnalyzedGameRepository;
import com.chessanalysis.auth.game.repository.AnalyzedMoveRepository;
import com.chessanalysis.auth.puzzle.entity.Puzzle;
import com.chessanalysis.auth.puzzle.repository.PuzzleRepository;
import com.chessanalysis.auth.review.dto.DueCardResponse;
import com.chessanalysis.auth.review.dto.ReviewOutcome;
import com.chessanalysis.auth.review.dto.ReviewSummaryResponse;

/**
 * Lịch ôn tập ngắt quãng.
 *
 * <p>Thẻ không do người học tự thêm: một puzzle giải sai, hoặc một sai lầm trong ván trả
 * lời sai, tự sinh ra thẻ đến hạn sau một ngày. Mỗi lần làm lại một bài đã có thẻ (dù
 * từ trang "Ôn tập hôm nay" hay gặp lại ở nơi khác) đều cập nhật lịch theo SM-2.
 */
@Service
public class ReviewService {
    static final int DUE_LIST_LIMIT = 50;
    static final int LEARNED_INTERVAL_DAYS = 21;

    private final ReviewCardRepository cards;
    private final PuzzleRepository puzzles;
    private final AnalyzedMoveRepository moves;
    private final AnalyzedGameRepository games;

    public ReviewService(ReviewCardRepository cards, PuzzleRepository puzzles,
            AnalyzedMoveRepository moves, AnalyzedGameRepository games) {
        this.cards = cards;
        this.puzzles = puzzles;
        this.moves = moves;
        this.games = games;
    }

    /**
     * Ghi kết quả một lần làm bài. Trả lịch ôn mới nếu bài có (hoặc vừa có) thẻ, và
     * {@code null} khi làm đúng một bài chưa từng sai — bài đó không cần ôn.
     */
    @Transactional
    public ReviewOutcome record(Long userId, String kind, Long itemId, boolean correct) {
        Instant now = Instant.now();
        ReviewCard card = cards.findByUserIdAndKindAndItemId(userId, kind, itemId).orElse(null);
        boolean created = false;
        if (card != null) {
            card.review(correct, now);
        } else if (!correct) {
            card = new ReviewCard(userId, kind, itemId, now);
            created = true;
        } else {
            return null;
        }
        cards.save(card);
        return new ReviewOutcome(created, card.getIntervalDays(), card.getDueAt(), card.getRepetitions());
    }

    @Transactional(readOnly = true)
    public ReviewSummaryResponse summary(Long userId) {
        Instant now = Instant.now();
        List<ReviewCard> due = cards.findDue(userId, now, PageRequest.of(0, DUE_LIST_LIMIT));

        Map<Long, Puzzle> puzzleById = byId(puzzles.findAllById(itemIds(due, ReviewCard.PUZZLE)), Puzzle::getId);
        Map<Long, AnalyzedMove> moveById = byId(moves.findAllById(itemIds(due, ReviewCard.MISTAKE)), AnalyzedMove::getId);
        Map<Long, AnalyzedGame> gameById = byId(games.findAllById(
                moveById.values().stream().map(AnalyzedMove::getGameId).distinct().toList()), AnalyzedGame::getId);

        List<DueCardResponse> listed = new ArrayList<>();
        for (ReviewCard card : due) {
            String title;
            String detail;
            if (ReviewCard.PUZZLE.equals(card.getKind())) {
                Puzzle puzzle = puzzleById.get(card.getItemId());
                if (puzzle == null) continue;
                title = "Puzzle " + puzzle.getRating();
                detail = puzzle.getThemes();
            } else {
                AnalyzedMove move = moveById.get(card.getItemId());
                if (move == null) continue;
                AnalyzedGame game = gameById.get(move.getGameId());
                title = game == null ? "Ván đã lưu" : game.getTitle();
                detail = "Nước " + move.getMoveNumber() + ": " + move.getSan() + " (" + move.getRuleLabel() + ")";
            }
            listed.add(new DueCardResponse(card.getId(), card.getKind(), card.getItemId(), title, detail,
                    card.getDueAt(), card.getIntervalDays(), card.getRepetitions(), card.getLapses()));
        }

        return new ReviewSummaryResponse(
                cards.countByUserIdAndDueAtLessThanEqual(userId, now),
                cards.countByUserId(userId),
                cards.countByUserIdAndIntervalDaysGreaterThanEqual(userId, LEARNED_INTERVAL_DAYS),
                cards.findNextDueAfter(userId, now).orElse(null),
                listed);
    }

    private static List<Long> itemIds(List<ReviewCard> due, String kind) {
        return due.stream().filter(card -> kind.equals(card.getKind())).map(ReviewCard::getItemId).toList();
    }

    private static <T> Map<Long, T> byId(Iterable<T> items, Function<T, Long> id) {
        List<T> list = new ArrayList<>();
        items.forEach(list::add);
        return list.stream().collect(Collectors.toMap(id, Function.identity(), (left, right) -> left));
    }
}

package com.chessanalysis.auth.puzzle.service;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.chessanalysis.auth.puzzle.entity.Puzzle;
import com.chessanalysis.auth.puzzle.entity.PuzzleAttempt;
import com.chessanalysis.auth.puzzle.entity.UserPuzzleRating;
import com.chessanalysis.auth.puzzle.rating.Glicko2;
import com.chessanalysis.auth.puzzle.repository.PuzzleAttemptRepository;
import com.chessanalysis.auth.puzzle.repository.UserPuzzleRatingRepository;

/**
 * Rating luyện puzzle của người học.
 *
 * <p>Mỗi lượt giải là một kỳ Glicko-2 với một "ván": đối thủ là puzzle (rating và RD
 * của Lichess), giải đúng là thắng, sai là thua. Rating cập nhật ngay sau mỗi lượt,
 * giống Lichess. Mỗi ngày không luyện được tính là một kỳ không thi đấu, nên người
 * nghỉ lâu có RD tăng lên và rating dịch chuyển nhanh hơn khi quay lại.
 */
@Service
public class PuzzleRatingService {
    static final double TAU = 0.5;
    static final double MIN_DEVIATION = 50;
    /** Lichess coi rating là "tạm tính" khi RD còn trên mức này. */
    static final double PROVISIONAL_DEVIATION = 110;

    private final Glicko2 glicko = new Glicko2(TAU, MIN_DEVIATION);
    private final UserPuzzleRatingRepository ratings;
    private final PuzzleAttemptRepository attempts;

    public PuzzleRatingService(UserPuzzleRatingRepository ratings, PuzzleAttemptRepository attempts) {
        this.ratings = ratings;
        this.attempts = attempts;
    }

    public record Snapshot(Glicko2.Rating rating, int attempts, int solved) {
        public boolean provisional() {
            return rating.deviation() > PROVISIONAL_DEVIATION;
        }
    }

    public record RatingChange(Glicko2.Rating before, Glicko2.Rating after) {
        public double delta() {
            return after.rating() - before.rating();
        }
    }

    /** Rating hiện tại (đã tính phần RD tăng do nghỉ); người chưa giải lần nào có rating ban đầu. */
    @Transactional(readOnly = true)
    public Snapshot current(Long userId) {
        Instant now = Instant.now();
        return ratings.findById(userId)
                .map(row -> new Snapshot(glicko.decay(row.toRating(), idleDays(row.getUpdatedAt(), now)),
                        row.getAttempts(), row.getSolved()))
                .orElseGet(() -> new Snapshot(Glicko2.Rating.initial(), 0, 0));
    }

    /** Ghi một lượt giải và cập nhật rating; được gọi khi server đã xác định đúng/sai. */
    @Transactional
    public RatingChange record(Long userId, Puzzle puzzle, boolean solved) {
        Instant now = Instant.now();
        UserPuzzleRating row = ratings.findForUpdate(userId)
                .orElseGet(() -> new UserPuzzleRating(userId, Glicko2.Rating.initial(), now));

        Glicko2.Rating before = glicko.decay(row.toRating(), idleDays(row.getUpdatedAt(), now));
        Glicko2.Rating after = glicko.update(before, List.of(
                new Glicko2.Result(puzzle.getRating(), puzzle.getRatingDeviation(), solved ? 1 : 0)));

        row.apply(after, solved, now);
        ratings.save(row);
        attempts.save(new PuzzleAttempt(userId, puzzle.getId(), solved, before.rating(), after.rating(),
                after.deviation(), puzzle.getRating(), now));
        return new RatingChange(before, after);
    }

    /**
     * Ghi lượt giải lại một puzzle đã gặp: vẫn lưu vào lịch sử (cho ôn tập và thống kê)
     * nhưng không đổi rating. Như Lichess, giải lại một bài đã biết lời giải không nói
     * lên trình độ.
     */
    @Transactional
    public void recordUnrated(Long userId, Puzzle puzzle, boolean solved) {
        Glicko2.Rating rating = current(userId).rating();
        attempts.save(new PuzzleAttempt(userId, puzzle.getId(), solved, rating.rating(), rating.rating(),
                rating.deviation(), puzzle.getRating(), Instant.now()));
    }

    private static long idleDays(Instant lastUpdate, Instant now) {
        return Math.max(0, Duration.between(lastUpdate, now).toDays());
    }
}

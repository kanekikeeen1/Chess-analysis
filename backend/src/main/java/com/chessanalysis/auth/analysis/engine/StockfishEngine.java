package com.chessanalysis.auth.analysis.engine;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.chessanalysis.auth.analysis.dto.EngineVariationResponse;
import com.chessanalysis.auth.analysis.dto.PositionEvaluationResponse;

public final class StockfishEngine implements AutoCloseable {
    private static final Pattern DEPTH = Pattern.compile("\\bdepth (\\d+)");
    private static final Pattern MULTI_PV = Pattern.compile("\\bmultipv (\\d+)");
    private static final Pattern SCORE = Pattern.compile("\\bscore (cp|mate) (-?\\d+)");
    private static final Pattern PV = Pattern.compile("\\bpv (.+)$");

    private final Process process;
    private final BufferedReader output;
    private final BufferedWriter input;
    private final Duration timeout;

    public StockfishEngine(String executable, int threads, int hashMb, Duration timeout) {
        try {
            process = new ProcessBuilder(executable).redirectErrorStream(true).start();
            output = new BufferedReader(new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8));
            input = new BufferedWriter(new OutputStreamWriter(process.getOutputStream(), StandardCharsets.UTF_8));
            this.timeout = timeout;

            send("uci");
            waitFor("uciok", Duration.ofSeconds(15));
            send("setoption name Threads value " + Math.max(1, threads));
            send("setoption name Hash value " + Math.max(16, hashMb));
            send("setoption name MultiPV value 2");
            send("isready");
            waitFor("readyok", Duration.ofSeconds(15));
        } catch (IOException exception) {
            throw new IllegalStateException(
                    "Không khởi động được Stockfish tại '" + executable
                            + "'. Hãy cấu hình biến STOCKFISH_PATH.", exception);
        }
    }

    public PositionEvaluationResponse analyze(String fen, int depth, int positionIndex) {
        send("position fen " + fen);
        send("go depth " + depth);

        Map<Integer, EngineVariationResponse> variations = new HashMap<>();
        long deadline = System.nanoTime() + timeout.toNanos();

        while (System.nanoTime() < deadline) {
            String line = nextLine(deadline);
            if (line == null) continue;
            if (line.startsWith("info ") && line.contains(" score ")) {
                ParsedInfo parsed = parseInfo(line, fen);
                if (parsed != null) {
                    EngineVariationResponse existing = variations.get(parsed.multiPv());
                    if (existing == null || parsed.variation().depth() >= existing.depth()) {
                        variations.put(parsed.multiPv(), parsed.variation());
                    }
                }
            }
            if (line.startsWith("bestmove")) {
                List<EngineVariationResponse> ordered = variations.entrySet().stream()
                        .sorted(Map.Entry.comparingByKey())
                        .map(Map.Entry::getValue)
                        .toList();
                if (ordered.isEmpty()) {
                    throw new IllegalStateException("Stockfish không trả về đánh giá cho vị trí " + positionIndex + ".");
                }
                EngineVariationResponse primary = ordered.get(0);
                return new PositionEvaluationResponse(
                        positionIndex, fen, primary.depth(), primary.mate(), primary.moves(),
                        primary.pawns(), ordered);
            }
        }

        send("stop");
        throw new IllegalStateException("Stockfish quá thời gian ở vị trí " + (positionIndex + 1) + ".");
    }

    private ParsedInfo parseInfo(String line, String fen) {
        Matcher score = SCORE.matcher(line);
        if (!score.find()) return null;

        Matcher depthMatcher = DEPTH.matcher(line);
        Matcher multipvMatcher = MULTI_PV.matcher(line);
        Matcher pvMatcher = PV.matcher(line);
        int reachedDepth = depthMatcher.find() ? Integer.parseInt(depthMatcher.group(1)) : 0;
        int multiPv = multipvMatcher.find() ? Integer.parseInt(multipvMatcher.group(1)) : 1;
        int raw = Integer.parseInt(score.group(2));
        boolean whiteToMove = fen.split("\\s+")[1].equals("w");
        int whiteScore = whiteToMove ? raw : -raw;
        Integer mate = score.group(1).equals("mate") ? whiteScore : null;
        double pawns = mate == null ? whiteScore / 100.0 : (whiteScore >= 0 ? 100.0 : -100.0);
        List<String> moves = pvMatcher.find()
                ? List.of(pvMatcher.group(1).trim().split("\\s+"))
                : List.of();
        return new ParsedInfo(multiPv, new EngineVariationResponse(reachedDepth, mate, moves, pawns));
    }

    private void waitFor(String expected, Duration wait) {
        long deadline = System.nanoTime() + wait.toNanos();
        while (System.nanoTime() < deadline) {
            String line = nextLine(deadline);
            if (expected.equals(line)) return;
        }
        throw new IllegalStateException("Stockfish không phản hồi " + expected + ".");
    }

    private String nextLine(long deadline) {
        try {
            while (System.nanoTime() < deadline) {
                if (output.ready()) return output.readLine();
                if (!process.isAlive()) {
                    throw new IllegalStateException("Tiến trình Stockfish đã dừng bất ngờ.");
                }
                Thread.sleep(5);
            }
            return null;
        } catch (IOException exception) {
            throw new IllegalStateException("Không đọc được kết quả Stockfish.", exception);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Tác vụ Stockfish đã bị hủy.", exception);
        }
    }

    private void send(String command) {
        try {
            input.write(command);
            input.newLine();
            input.flush();
        } catch (IOException exception) {
            throw new IllegalStateException("Không gửi được lệnh tới Stockfish.", exception);
        }
    }

    @Override
    public void close() {
        try {
            if (process.isAlive()) send("quit");
        } catch (RuntimeException ignored) {
            // Tiếp tục hủy cưỡng bức nếu engine đã đóng luồng nhập.
        }
        try {
            if (!process.waitFor(1, java.util.concurrent.TimeUnit.SECONDS)) process.destroyForcibly();
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            process.destroyForcibly();
        }
    }

    private record ParsedInfo(int multiPv, EngineVariationResponse variation) {}
}

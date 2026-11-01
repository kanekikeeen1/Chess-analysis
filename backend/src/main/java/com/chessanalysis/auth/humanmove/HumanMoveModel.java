package com.chessanalysis.auth.humanmove;

import java.io.IOException;
import java.nio.FloatBuffer;
import java.nio.LongBuffer;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import com.chessanalysis.auth.service.ApiException;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.bhlangonijr.chesslib.Board;
import com.github.bhlangonijr.chesslib.Side;
import com.github.bhlangonijr.chesslib.move.Move;
import com.github.bhlangonijr.chesslib.move.MoveConversionException;
import com.github.bhlangonijr.chesslib.move.MoveList;

import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtException;
import ai.onnxruntime.OrtSession;

/**
 * Mô hình M2 ("người ở Elo X sẽ đi nước nào") chạy bằng ONNX Runtime ngay trong JVM.
 *
 * <p>File {@code .onnx} do {@code python -m m2.export_onnx} sinh ra, kèm {@code .meta.json} chứa bảng
 * nước đi và các dải Elo. Thiếu file thì backend vẫn khởi động bình thường, chỉ có API này trả 503:
 * mô hình nặng ~30 MB và không nằm trong git, nên máy mới clone về chưa có nó.
 *
 * <p>{@link OrtSession#run} an toàn khi gọi song song nên dùng chung một phiên cho mọi request.
 */
@Component
public class HumanMoveModel implements DisposableBean {
    private static final Logger LOGGER = LoggerFactory.getLogger(HumanMoveModel.class);
    /** Số hàng tối đa mỗi lần gọi mô hình: 512 hàng × 1280 số thực ≈ 2,6 MB đầu vào. */
    private static final int MAX_BATCH_ROWS = 512;

    private final Path modelPath;
    private final OrtEnvironment environment;
    private final OrtSession session;
    private final M2Encoding encoding;
    private final Metadata metadata;
    private final String unavailableReason;

    public HumanMoveModel(
            @Value("${app.human-moves.model-path:../ml/models/m2.onnx}") String modelPath,
            ObjectMapper objectMapper) {
        this.modelPath = Path.of(modelPath).toAbsolutePath().normalize();
        Path metaPath = metadataPath(this.modelPath);

        if (!Files.isRegularFile(this.modelPath) || !Files.isRegularFile(metaPath)) {
            this.environment = null;
            this.session = null;
            this.encoding = null;
            this.metadata = null;
            this.unavailableReason = "Chưa có mô hình M2 tại " + this.modelPath
                    + ". Hãy xuất mô hình bằng python -m m2.export_onnx.";
            LOGGER.warn(unavailableReason);
            return;
        }

        try {
            this.metadata = objectMapper.readValue(metaPath.toFile(), Metadata.class);
            metadata.validate();
            this.encoding = new M2Encoding(metadata.moveUcis(),
                    metadata.eloBucketEdges().stream().mapToInt(Integer::intValue).toArray(),
                    metadata.eloCenter(), metadata.eloScale());
            this.environment = OrtEnvironment.getEnvironment();
            this.session = environment.createSession(this.modelPath.toString(), new OrtSession.SessionOptions());
        } catch (IOException | OrtException exception) {
            throw new IllegalStateException("Không nạp được mô hình M2 " + this.modelPath, exception);
        }
        this.unavailableReason = null;
        LOGGER.info("Đã nạp mô hình M2 {} (bước huấn luyện {}, {} nước, {} dải Elo)",
                this.modelPath, metadata.trainStep(), encoding.numMoves(), encoding.numEloBuckets());
    }

    public boolean available() {
        return session != null;
    }

    public String unavailableReason() {
        return unavailableReason;
    }

    /** Bộ mã hóa của mô hình đang nạp; {@code null} nếu chưa có mô hình. */
    public M2Encoding encoding() {
        return encoding;
    }

    public Integer trainStep() {
        return metadata == null ? null : metadata.trainStep();
    }

    /**
     * Top {@code topK} nước hợp lệ cho từng mức Elo, xác suất đã chuẩn hóa trên các nước hợp lệ.
     * Mọi mức Elo chạy trong một lô duy nhất.
     */
    public List<List<HumanMove>> predict(Board board, List<Integer> elos, int topK) {
        return predict(board, elos, topK, false);
    }

    /**
     * Như {@link #predict(Board, List, int)}; khi {@code shared} thì mọi mức Elo trả về cùng một tập nước
     * (hợp các top {@code topK} của từng mức, xếp theo xác suất trung bình), để giao diện đọc một nước
     * theo hàng ngang qua các mức.
     */
    public List<List<HumanMove>> predict(Board board, List<Integer> elos, int topK, boolean shared) {
        if (!available()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, unavailableReason);
        }
        List<Move> legal = board.legalMoves();
        if (legal.isEmpty()) {
            return elos.stream().<List<HumanMove>>map(elo -> List.of()).toList();
        }

        float[][] logits = run(board, elos);
        int[] indices = new int[legal.size()];
        for (int i = 0; i < legal.size(); i++) {
            indices[i] = encoding.moveIndex(legal.get(i), board.getSideToMove());
        }

        double[][] probabilities = new double[logits.length][];
        for (int r = 0; r < logits.length; r++) probabilities[r] = softmax(logits[r], indices);

        List<List<HumanMove>> results = new ArrayList<>(elos.size());
        if (!shared) {
            for (double[] row : probabilities) results.add(moves(board, legal, row, top(row, topK)));
            return results;
        }
        Set<Integer> union = new LinkedHashSet<>();
        for (double[] row : probabilities) union.addAll(top(row, topK));
        List<Integer> order = new ArrayList<>(union);
        order.sort(Comparator.comparingDouble(i -> {
            double total = 0;
            for (double[] row : probabilities) total -= row[i];
            return total;
        }));
        for (double[] row : probabilities) results.add(moves(board, legal, row, order));
        return results;
    }

    /**
     * Tổng log-xác suất mô hình gán cho các nước người chơi đã thực sự đi, tại từng mức Elo trên
     * {@code grid}: log-likelihood mà {@link EloEstimator} dùng. Mỗi thế cờ chỉ mã hóa một lần rồi
     * nhân lên theo lưới, chạy theo lô tối đa {@value #MAX_BATCH_ROWS} hàng.
     */
    public double[] logLikelihood(List<PlayedMove> played, double[] grid) {
        if (!available()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, unavailableReason);
        }
        double[] total = new double[grid.length];
        int positionsPerBatch = Math.max(1, MAX_BATCH_ROWS / grid.length);
        for (int start = 0; start < played.size(); start += positionsPerBatch) {
            List<PlayedMove> chunk = played.subList(start, Math.min(played.size(), start + positionsPerBatch));
            List<float[]> planes = new ArrayList<>(chunk.size() * grid.length);
            double[] elos = new double[chunk.size() * grid.length];
            for (int p = 0; p < chunk.size(); p++) {
                float[] encoded = encoding.encode(chunk.get(p).board());
                for (int g = 0; g < grid.length; g++) {
                    planes.add(encoded);
                    elos[p * grid.length + g] = grid[g];
                }
            }
            float[][] logits = run(planes, elos);
            for (int p = 0; p < chunk.size(); p++) {
                PlayedMove move = chunk.get(p);
                Side mover = move.board().getSideToMove();
                List<Move> legal = move.board().legalMoves();
                int[] indices = new int[legal.size()];
                for (int i = 0; i < legal.size(); i++) indices[i] = encoding.moveIndex(legal.get(i), mover);
                int playedIndex = encoding.moveIndex(move.move(), mover);
                for (int g = 0; g < grid.length; g++) {
                    float[] row = logits[p * grid.length + g];
                    total[g] += row[playedIndex] - logSumExp(row, indices);
                }
            }
        }
        return total;
    }

    /**
     * Thứ hạng (0 = nước mô hình cho xác suất cao nhất) của nước đã đi trong từng thế cờ, ở một mức Elo:
     * dùng để đếm "bao nhiêu nước trùng lựa chọn của mô hình". Chạy theo lô như {@link #logLikelihood}.
     */
    public int[] playedRanks(List<PlayedMove> played, int elo) {
        if (!available()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, unavailableReason);
        }
        int[] ranks = new int[played.size()];
        for (int start = 0; start < played.size(); start += MAX_BATCH_ROWS) {
            List<PlayedMove> chunk = played.subList(start, Math.min(played.size(), start + MAX_BATCH_ROWS));
            List<float[]> planes = new ArrayList<>(chunk.size());
            double[] elos = new double[chunk.size()];
            for (int p = 0; p < chunk.size(); p++) {
                planes.add(encoding.encode(chunk.get(p).board()));
                elos[p] = elo;
            }
            float[][] logits = run(planes, elos);
            for (int p = 0; p < chunk.size(); p++) {
                PlayedMove move = chunk.get(p);
                Side mover = move.board().getSideToMove();
                float playedLogit = logits[p][encoding.moveIndex(move.move(), mover)];
                int rank = 0;
                for (Move legal : move.board().legalMoves()) {
                    if (logits[p][encoding.moveIndex(legal, mover)] > playedLogit) rank++;
                }
                ranks[start + p] = rank;
            }
        }
        return ranks;
    }

    private float[][] run(Board board, List<Integer> elos) {
        float[] single = encoding.encode(board);
        List<float[]> planes = new ArrayList<>(elos.size());
        double[] values = new double[elos.size()];
        for (int i = 0; i < elos.size(); i++) {
            planes.add(single);
            values[i] = elos.get(i);
        }
        return run(planes, values);
    }

    /** Mỗi hàng là một cặp (thế cờ đã mã hóa, Elo). */
    private float[][] run(List<float[]> encoded, double[] elos) {
        int batch = elos.length;
        int size = M2Encoding.NUM_PLANES * M2Encoding.CELLS;
        float[] planes = new float[batch * size];
        long[] buckets = new long[batch];
        float[] norms = new float[batch];
        for (int i = 0; i < batch; i++) {
            System.arraycopy(encoded.get(i), 0, planes, i * size, size);
            buckets[i] = encoding.eloBucket(elos[i]);
            norms[i] = encoding.normalizeElo(elos[i]);
        }

        try (OnnxTensor planesTensor = OnnxTensor.createTensor(environment, FloatBuffer.wrap(planes),
                     new long[] {batch, M2Encoding.NUM_PLANES, 8, 8});
             OnnxTensor bucketTensor = OnnxTensor.createTensor(environment, LongBuffer.wrap(buckets), new long[] {batch});
             OnnxTensor normTensor = OnnxTensor.createTensor(environment, FloatBuffer.wrap(norms), new long[] {batch});
             OrtSession.Result result = session.run(Map.of(
                     "planes", planesTensor, "elo_bucket", bucketTensor, "elo_norm", normTensor),
                     java.util.Set.of("policy_logits"))) {
            return (float[][]) result.get(0).getValue();
        } catch (OrtException exception) {
            throw new IllegalStateException("Mô hình M2 lỗi khi suy luận", exception);
        }
    }

    private static double logSumExp(float[] logits, int[] indices) {
        double max = Double.NEGATIVE_INFINITY;
        for (int index : indices) max = Math.max(max, logits[index]);
        double sum = 0;
        for (int index : indices) sum += Math.exp(logits[index] - max);
        return max + Math.log(sum);
    }

    /** Softmax chỉ trên các nước hợp lệ (tính bằng double); phần tử i ứng với nước hợp lệ thứ i. */
    private static double[] softmax(float[] logits, int[] indices) {
        double max = Double.NEGATIVE_INFINITY;
        for (int index : indices) max = Math.max(max, logits[index]);
        double[] weights = new double[indices.length];
        double sum = 0;
        for (int i = 0; i < indices.length; i++) {
            weights[i] = Math.exp(logits[indices[i]] - max);
            sum += weights[i];
        }
        for (int i = 0; i < weights.length; i++) weights[i] /= sum;
        return weights;
    }

    /** Vị trí (trong danh sách nước hợp lệ) của {@code topK} nước có xác suất cao nhất. */
    private static List<Integer> top(double[] probabilities, int topK) {
        List<Integer> order = new ArrayList<>(probabilities.length);
        for (int i = 0; i < probabilities.length; i++) order.add(i);
        order.sort(Comparator.comparingDouble(i -> -probabilities[i]));
        return order.subList(0, Math.min(topK, order.size()));
    }

    private static List<HumanMove> moves(Board board, List<Move> legal, double[] probabilities, List<Integer> order) {
        List<HumanMove> moves = new ArrayList<>(order.size());
        for (int i : order) {
            Move move = legal.get(i);
            moves.add(new HumanMove(move.toString(), san(board, move), probabilities[i]));
        }
        return moves;
    }

    /** SAN của một nước hợp lệ; nếu chesslib không đổi được thì trả UCI. */
    public static String san(Board board, Move move) {
        try {
            MoveList list = new MoveList(board.getFen());
            list.add(move);
            return list.toSanArray()[0];
        } catch (MoveConversionException exception) {
            return move.toString();
        }
    }

    static Path metadataPath(Path modelPath) {
        String name = modelPath.getFileName().toString();
        String stem = name.endsWith(".onnx") ? name.substring(0, name.length() - ".onnx".length()) : name;
        return modelPath.resolveSibling(stem + ".meta.json");
    }

    @Override
    public void destroy() throws OrtException {
        if (session != null) session.close();
    }

    public record HumanMove(String uci, String san, double probability) {}

    /** Một nước người chơi đã đi: thế cờ ngay trước nước đó và chính nước đó. */
    public record PlayedMove(Board board, Move move) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Metadata(
            int numMoves,
            int numPlanes,
            int numEloBuckets,
            List<Integer> eloBucketEdges,
            double eloCenter,
            double eloScale,
            Integer trainStep,
            List<String> moveUcis) {

        void validate() {
            if (numPlanes != M2Encoding.NUM_PLANES) {
                throw new IllegalStateException("Mô hình dùng " + numPlanes + " mặt phẳng, backend chỉ hỗ trợ "
                        + M2Encoding.NUM_PLANES + ". Cần cập nhật M2Encoding.");
            }
            if (moveUcis == null || moveUcis.size() != numMoves) {
                throw new IllegalStateException("Metadata mô hình M2 hỏng: bảng nước đi không đủ " + numMoves + " phần tử.");
            }
            if (eloBucketEdges == null || eloBucketEdges.size() + 1 != numEloBuckets) {
                throw new IllegalStateException("Metadata mô hình M2 hỏng: số dải Elo không khớp.");
            }
        }
    }
}

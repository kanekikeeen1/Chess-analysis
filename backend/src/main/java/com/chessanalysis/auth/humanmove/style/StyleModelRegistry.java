package com.chessanalysis.auth.humanmove.style;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import com.chessanalysis.auth.humanmove.HumanMoveModel;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import ai.onnxruntime.OrtException;

/**
 * Các mô hình theo phong cách kỳ thủ (giai đoạn D), do {@code ml/scripts/export_style_models.py} xuất ra cùng một
 * thư mục: {@code styles.json} liệt kê từng kỳ thủ, mỗi người có một file ONNX cùng định dạng M2 (nạp bằng chính
 * {@link HumanMoveModel}) và một sổ khai cuộc lấy từ ván của họ.
 *
 * <p>Thiếu thư mục thì backend vẫn chạy, chỉ trang đấu kiện tướng báo chưa có mô hình: mỗi mô hình ~29 MB và
 * không nằm trong git.
 */
@Component
public class StyleModelRegistry implements DisposableBean {
    private static final Logger LOGGER = LoggerFactory.getLogger(StyleModelRegistry.class);

    private final Path directory;
    private final Map<String, Style> styles = new LinkedHashMap<>();
    private final String unavailableReason;

    public StyleModelRegistry(@Value("${app.styles.dir:../ml/models/styles}") String directory,
            ObjectMapper objectMapper) {
        this.directory = Path.of(directory).toAbsolutePath().normalize();
        Path manifestPath = this.directory.resolve("styles.json");
        if (!Files.isRegularFile(manifestPath)) {
            unavailableReason = "Chưa có mô hình kỳ thủ tại " + this.directory
                    + ". Hãy chạy python scripts/export_style_models.py.";
            LOGGER.warn(unavailableReason);
            return;
        }
        try {
            Manifest manifest = objectMapper.readValue(manifestPath.toFile(), Manifest.class);
            for (Entry entry : manifest.styles()) {
                HumanMoveModel model = new HumanMoveModel(this.directory.resolve(entry.model()).toString(), objectMapper);
                if (!model.available()) {
                    LOGGER.warn("Bỏ qua kỳ thủ {}: {}", entry.id(), model.unavailableReason());
                    continue;
                }
                Map<String, Map<String, Integer>> book = entry.book() == null ? Map.of()
                        : objectMapper.readValue(this.directory.resolve(entry.book()).toFile(), new TypeReference<>() {});
                styles.put(entry.id(), new Style(entry, model, book));
                LOGGER.info("Đã nạp mô hình phong cách {} ({} ván, sổ khai cuộc {} thế cờ)",
                        entry.displayName(), entry.games(), book.size());
            }
        } catch (IOException exception) {
            throw new IllegalStateException("Không đọc được " + manifestPath, exception);
        }
        unavailableReason = styles.isEmpty() ? "styles.json không có mô hình nào nạp được." : null;
    }

    public List<Style> all() {
        return List.copyOf(styles.values());
    }

    public Optional<Style> find(String id) {
        return Optional.ofNullable(styles.get(id));
    }

    public String unavailableReason() {
        return unavailableReason;
    }

    @Override
    public void destroy() throws OrtException {
        for (Style style : styles.values()) style.model().destroy();
    }

    /** Một kỳ thủ: thông tin trong manifest, mô hình và sổ khai cuộc (khóa: 4 trường đầu của FEN kiểu chess.js). */
    public record Style(Entry entry, HumanMoveModel model, Map<String, Map<String, Integer>> book) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Manifest(List<Entry> styles) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Entry(
            String id,
            String displayName,
            String model,
            String book,
            int elo,
            int games,
            Integer firstYear,
            Integer lastYear,
            Map<String, Integer> bySpeed,
            Map<String, Integer> bySource,
            Double testTop1,
            Double baseTop1) {}
}

CREATE TABLE analysis_jobs (
    id BIGINT NOT NULL AUTO_INCREMENT,
    public_id CHAR(36) NOT NULL,
    user_id BIGINT NULL,
    source_type VARCHAR(8) NOT NULL,
    status VARCHAR(16) NOT NULL,
    progress_percent INT NOT NULL DEFAULT 0,
    completed_positions INT NOT NULL DEFAULT 0,
    total_positions INT NOT NULL,
    min_depth INT NOT NULL,
    max_depth INT NOT NULL,
    current_position INT NULL,
    request_json LONGTEXT NOT NULL,
    result_json LONGTEXT NULL,
    error_message VARCHAR(500) NULL,
    created_at TIMESTAMP(6) NOT NULL,
    updated_at TIMESTAMP(6) NOT NULL,
    completed_at TIMESTAMP(6) NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_analysis_jobs_public_id UNIQUE (public_id),
    CONSTRAINT fk_analysis_jobs_user FOREIGN KEY (user_id)
        REFERENCES user_accounts (id) ON DELETE SET NULL
);

CREATE INDEX idx_analysis_jobs_user_created ON analysis_jobs (user_id, created_at);
CREATE INDEX idx_analysis_jobs_status_created ON analysis_jobs (status, created_at);

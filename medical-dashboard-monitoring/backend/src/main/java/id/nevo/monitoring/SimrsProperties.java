package id.nevo.monitoring;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.net.URI;

@ConfigurationProperties(prefix = "nevo.simrs")
public class SimrsProperties {
    private boolean enabled;
    private String baseUrl = "";
    private String monitoringToken = "";
    private boolean writeEnabled;
    private int pollIntervalSeconds = 30;
    private int connectTimeoutMs = 5000;
    private int readTimeoutMs = 10000;

    public boolean isConfigured() {
        if (!enabled || baseUrl == null || baseUrl.isBlank() || monitoringToken == null || monitoringToken.isBlank()) return false;
        try {
            URI uri = URI.create(baseUrl.trim());
            return uri.getHost() != null && ("https".equalsIgnoreCase(uri.getScheme())
                    || ("http".equalsIgnoreCase(uri.getScheme()) && "localhost".equalsIgnoreCase(uri.getHost())));
        } catch (IllegalArgumentException ex) {
            return false;
        }
    }

    public String normalizedBaseUrl() {
        if (baseUrl == null) return "";
        return baseUrl.trim().replaceAll("/+$", "");
    }

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public String getBaseUrl() { return baseUrl; }
    public void setBaseUrl(String baseUrl) { this.baseUrl = baseUrl; }
    public String getMonitoringToken() { return monitoringToken; }
    public void setMonitoringToken(String monitoringToken) { this.monitoringToken = monitoringToken; }
    public boolean isWriteEnabled() { return writeEnabled; }
    public void setWriteEnabled(boolean writeEnabled) { this.writeEnabled = writeEnabled; }
    public int getPollIntervalSeconds() { return pollIntervalSeconds; }
    public void setPollIntervalSeconds(int value) { this.pollIntervalSeconds = value; }
    public int getConnectTimeoutMs() { return connectTimeoutMs; }
    public void setConnectTimeoutMs(int value) { this.connectTimeoutMs = value; }
    public int getReadTimeoutMs() { return readTimeoutMs; }
    public void setReadTimeoutMs(int value) { this.readTimeoutMs = value; }
}

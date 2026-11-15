package id.nevo.monitoring;

import org.springframework.stereotype.Component;

import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.URI;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/** Server-side allow-list and SSRF guard for runtime SIMRS destinations. */
@Component
public class SimrsDestinationPolicy {
    private final SimrsProperties properties;

    public SimrsDestinationPolicy(SimrsProperties properties) {
        this.properties = properties;
    }

    public URI validate(String rawUrl) {
        if (rawUrl == null || rawUrl.isBlank()) throw new IllegalArgumentException("Base URL SIMRS wajib diisi");
        final URI uri;
        try {
            uri = URI.create(rawUrl.trim());
        } catch (IllegalArgumentException ex) {
            throw new IllegalArgumentException("Base URL SIMRS tidak valid");
        }
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
        if (!("http".equals(scheme) || "https".equals(scheme)) || host.isBlank()) {
            throw new IllegalArgumentException("Base URL harus menggunakan HTTP atau HTTPS dan memiliki hostname");
        }
        if (uri.getUserInfo() != null) throw new IllegalArgumentException("Username atau password tidak boleh disisipkan pada URL");
        if (uri.getQuery() != null || uri.getFragment() != null) throw new IllegalArgumentException("Base URL tidak boleh memiliki query atau fragment");
        if (uri.getPort() == 0 || uri.getPort() < -1 || uri.getPort() > 65535) throw new IllegalArgumentException("Port Base URL tidak valid");

        Set<String> trustedHosts = trustedHosts();
        if (!trustedHosts.contains(host)) {
            throw new IllegalArgumentException("Host SIMRS tidak termasuk SIMRS_ALLOWED_HOSTS pada konfigurasi server");
        }
        if ("http".equals(scheme) && !isPrivateOrLocalHost(host)) {
            throw new IllegalArgumentException("Host non-lokal wajib menggunakan HTTPS");
        }
        validateResolvedAddresses(host);
        return URI.create(normalize(uri));
    }

    private Set<String> trustedHosts() {
        Set<String> hosts = new HashSet<>();
        if (properties.getAllowedHosts() != null) {
            Arrays.stream(properties.getAllowedHosts().split(","))
                    .map(String::trim).map(v -> v.toLowerCase(Locale.ROOT)).filter(v -> !v.isBlank()).forEach(hosts::add);
        }
        try {
            String bootstrapHost = URI.create(properties.getBootstrapBaseUrl()).getHost();
            if (bootstrapHost != null) hosts.add(bootstrapHost.toLowerCase(Locale.ROOT));
        } catch (Exception ignored) { }
        return hosts;
    }

    private void validateResolvedAddresses(String host) {
        try {
            for (InetAddress address : InetAddress.getAllByName(host)) {
                if (isRestricted(address) && !properties.isAllowPrivateNetworks()) {
                    throw new IllegalArgumentException("Alamat private, loopback, link-local, atau metadata diblokir oleh kebijakan server");
                }
            }
        } catch (IllegalArgumentException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new IllegalArgumentException("Hostname SIMRS tidak dapat di-resolve");
        }
    }

    private static boolean isRestricted(InetAddress address) {
        if (address.isAnyLocalAddress() || address.isLoopbackAddress() || address.isLinkLocalAddress()
                || address.isSiteLocalAddress() || address.isMulticastAddress()) return true;
        byte[] bytes = address.getAddress();
        return address instanceof Inet6Address && bytes.length > 0 && (bytes[0] & 0xfe) == 0xfc;
    }

    private static boolean isPrivateOrLocalHost(String host) {
        if ("localhost".equals(host) || host.endsWith(".local") || !host.contains(".")) return true;
        try { return isRestricted(InetAddress.getByName(host)); }
        catch (Exception ignored) { return false; }
    }

    private static String normalize(URI uri) {
        String path = uri.getPath() == null ? "" : uri.getPath().replaceAll("/+$", "");
        try {
            return new URI(uri.getScheme().toLowerCase(Locale.ROOT), null, uri.getHost().toLowerCase(Locale.ROOT), uri.getPort(), path, null, null).toString();
        } catch (Exception ex) {
            throw new IllegalArgumentException("Base URL SIMRS tidak valid");
        }
    }
}

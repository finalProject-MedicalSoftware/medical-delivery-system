package id.nevo.monitoring;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.http.SessionCreationPolicy;

@Configuration
public class SecurityConfiguration {

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    AuthenticationManager authenticationManager(AuthenticationConfiguration configuration) throws Exception {
        return configuration.getAuthenticationManager();
    }

    @Bean
    UserDetailsService users(
            @Value("${nevo.demo-admin-password:}") String admin,
            @Value("${nevo.demo-operator-password:}") String operator,
            PasswordEncoder encoder) {
        if (admin.isBlank() || operator.isBlank()) {
            throw new IllegalStateException("Set NEVO_DEMO_ADMIN_PASSWORD and NEVO_DEMO_OPERATOR_PASSWORD");
        }
        return new InMemoryUserDetailsManager(
                User.withUsername("admin").password(encoder.encode(admin)).roles("ADMIN").build(),
                User.withUsername("operator").password(encoder.encode(operator)).roles("OPERATOR").build()
        );
    }

    @Bean
    SecurityFilterChain security(HttpSecurity http) throws Exception {
        return http.csrf(csrf -> csrf.disable())
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/actuator/health", "/error", "/ws/**").permitAll()
                        .requestMatchers("/api/v1/auth/**").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/v1/maps/*/activate").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.POST, "/api/v1/mappings/*/activate").hasRole("ADMIN")
                        .requestMatchers("/api/v1/**").hasAnyRole("ADMIN", "OPERATOR")
                        .anyRequest().denyAll())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED))
                .httpBasic(httpBasic -> httpBasic.disable())
                .build();
    }
}

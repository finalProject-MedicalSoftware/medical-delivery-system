package id.nevo.monitoring;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.scheduling.annotation.EnableScheduling;
@SpringBootApplication
@EnableScheduling
@EnableConfigurationProperties(SimrsProperties.class)
public class Application { public static void main(String[] args){ SpringApplication.run(Application.class,args); } }

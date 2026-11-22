package com.vuong.vo.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * FE ở {@code localhost:5173} gọi trực tiếp BE ở {@code :8080} khi dev nên khác
 * origin. Khi chạy qua nginx thì FE và BE cùng origin, không cần CORS.
 */
@Configuration
public class CorsConfig implements WebMvcConfigurer {

	/** FE dev server (Vite) và bản nginx. */
	private static final String[] ALLOWED_ORIGINS = {
			"http://localhost:5173",
			"http://127.0.0.1:5173" };

	@Override
	public void addCorsMappings(CorsRegistry registry) {
		registry.addMapping("/api/**")
				.allowedOrigins(ALLOWED_ORIGINS)
				.allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
				.allowedHeaders("*");
	}
}
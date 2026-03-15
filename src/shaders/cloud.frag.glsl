uniform sampler2D cloudTexture;
uniform vec3 sunDir;

varying vec2 vUv;

void main() {
    vec4 texel = texture2D(cloudTexture, vUv);

    float theta = (vUv.x - 0.5) * 6.28318530718;
    float phi = vUv.y * 3.14159265359;
    vec3 normal = vec3(cos(theta)*sin(phi), cos(phi), -sin(theta)*sin(phi));

    float intensity = dot(normal, sunDir);
    float alpha = smoothstep(-0.15, 0.05, intensity);

    // Sunset tint on clouds: ISS-derived colors, normalized bell curve
    float scatterMult = min(smoothstep(-0.3, 0.15, intensity) * smoothstep(0.15, -0.15, intensity) * 4.0, 1.0);
    vec3 sunsetDeep = vec3(0.75, 0.08, 0.10);
    vec3 sunsetWarm = vec3(1.0, 0.65, 0.55);
    float gradPos = smoothstep(-0.1, 0.0, intensity);
    vec3 sunsetColor = mix(sunsetDeep, sunsetWarm, gradPos);
    vec3 cloudColor = mix(texel.rgb, sunsetColor, scatterMult * 0.7);

    gl_FragColor = vec4(cloudColor, texel.a * alpha);
}

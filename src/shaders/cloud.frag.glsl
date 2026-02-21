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

    gl_FragColor = vec4(texel.rgb, texel.a * alpha);
}

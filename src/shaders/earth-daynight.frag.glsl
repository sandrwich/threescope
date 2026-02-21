uniform sampler2D dayTexture;
uniform sampler2D nightTexture;
uniform vec3 sunDir;
uniform float showNight;

varying vec2 vUv;

void main() {
    vec4 day = texture2D(dayTexture, vUv);

    if (showNight < 0.5) {
        gl_FragColor = day;
        return;
    }

    vec4 night = texture2D(nightTexture, vUv);
    float theta = (vUv.x - 0.5) * 6.28318530718;
    float phi = vUv.y * 3.14159265359;
    vec3 normal = vec3(cos(theta)*sin(phi), cos(phi), -sin(theta)*sin(phi));
    float intensity = dot(normal, sunDir);
    float blend = smoothstep(-0.15, 0.15, intensity);
    gl_FragColor = mix(night, day, blend);
}

uniform sampler2D dayTexture;
uniform sampler2D nightTexture;
uniform sampler2D normalMap;
uniform sampler2D displacementMap;
uniform vec3 sunDir;
uniform float showNight;
uniform float nightEmission;
uniform float hasNormalMap;
uniform float aoEnabled;
uniform float hasDisplacement;

varying vec2 vUv;

const float PI = 3.14159265359;
const float TWO_PI = 6.28318530718;
const float TEX_STEP = 1.0 / 2048.0;
const float AO_STRENGTH = 8.0;

void main() {
    vec4 day = texture2D(dayTexture, vUv);

    // Curvature AO from displacement map
    float ao = 1.0;
    if (hasDisplacement > 0.5 && aoEnabled > 0.5) {
        float hC = texture2D(displacementMap, vUv).r;
        float hL = texture2D(displacementMap, vUv + vec2(-TEX_STEP, 0.0)).r;
        float hR = texture2D(displacementMap, vUv + vec2( TEX_STEP, 0.0)).r;
        float hD = texture2D(displacementMap, vUv + vec2(0.0, -TEX_STEP)).r;
        float hU = texture2D(displacementMap, vUv + vec2(0.0,  TEX_STEP)).r;
        float laplacian = (hL + hR + hD + hU) * 0.25 - hC;
        ao = clamp(1.0 - laplacian * AO_STRENGTH, 0.5, 1.0);
    }

    if (showNight < 0.5) {
        gl_FragColor = day * ao;
        return;
    }

    vec4 night = texture2D(nightTexture, vUv);
    float theta = (vUv.x - 0.5) * TWO_PI;
    float phi = vUv.y * PI;

    float sinPhi = sin(phi);
    float cosPhi = cos(phi);
    float sinTheta = sin(theta);
    float cosTheta = cos(theta);

    vec3 normal = vec3(cosTheta * sinPhi, cosPhi, -sinTheta * sinPhi);

    // Perturb normal with tangent-space normal map
    if (hasNormalMap > 0.5) {
        // TBN basis from UV parameterization (body-fixed space)
        vec3 T = normalize(vec3(-sinTheta * sinPhi, 0.0, -cosTheta * sinPhi));
        vec3 B = normalize(vec3(cosTheta * cosPhi, -sinPhi, -sinTheta * cosPhi));

        vec3 mapN = texture2D(normalMap, vUv).rgb * 2.0 - 1.0;
        normal = normalize(T * mapN.x + B * mapN.y + normal * mapN.z);
    }

    float intensity = dot(normal, sunDir);
    float blend = smoothstep(-0.15, 0.15, intensity);

    // Boost night emission for bloom (HDR values > 1.0)
    vec4 boostedNight = vec4(night.rgb * nightEmission, night.a);
    gl_FragColor = mix(boostedNight, day * ao, blend);
}

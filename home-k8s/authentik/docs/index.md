---
title: "Authentik"
logo: "Authentik"
type: docs
draft: false
categories:
- K3S
---
## Purpose
Authentik is a single-sign-on provider that supports SAML, OIDC, LDAP, and Proxy connections

## Deployment
Authentik is deployed via Argo CD. Its source manifest is at [github.com/janikgar/home-k8s](https://github.com/janikgar/home-k8s/blob/main/applications/authentik.yaml).

## Monitoring
* [Logs](https://grafana.home.lan/explore?orgId=1&left=%7B%22datasource%22:%22Loki%22,%22queries%22:%5B%7B%22refId%22:%22A%22,%22editorMode%22:%22builder%22,%22expr%22:%22%7Bapp%3D%5C%22authentik%5C%22%7D%20%7C%3D%20%60%60%22,%22queryType%22:%22range%22%7D%5D,%22range%22:%7B%22from%22:%22now-1h%22,%22to%22:%22now%22%7D%7D)
* [Internal Metrics](https://authentik.home.lan/if/admin/#/administration/overview)

## Location
https://authentik.home.lan
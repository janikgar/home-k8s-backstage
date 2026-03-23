# Backstage Developer Portal

This is a [Backstage](https://backstage.io) developer portal - a modern application developer platform for building, managing, and deploying software.

## What It Does

- **Software catalog**: Catalog and organize your software components and services
- **Kubernetes integration**: View and manage Kubernetes clusters
- **CI/CD scaffolder**: Create new software projects from GitHub/GitLab/Bitbucket
- **API explorer**: Document and explore APIs
- **TechDocs**: Generate documentation from code repositories
- **Notifications**: Manage notifications and alerts
- **User settings**: Customizable user preferences

## Architecture

This is a standard Backstage monorepo:

- **packages/app**: The frontend React application
- **packages/backend**: The Node.js backend server
- **plugins/**: Directory for custom plugins

## Getting Started

```bash
yarn install
yarn start
```

## Running Tests and Linting

```bash
yarn lint       # Check linting
yarn test       # Run tests
yarn lint:all   # Run linting on all code (including uncommitted changes)
yarn test:all   # Run tests on everything
```

## Build

```bash
yarn build:all  # Build everything
```

## About Backstage

Backstage is an open-source developer portal that helps platform teams deliver a unified developer experience. It provides a consistent framework for teams to deliver new services and features.

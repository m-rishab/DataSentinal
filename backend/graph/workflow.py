"""LangGraph workflow definition for DataSentinel.

Topology:
    START → ingest
    ingest → (consent_agent, citation_tracer, duplication_agent,
              related_work_agent)                       # parallel fan-out
    all four → critic_aggregator                        # join
    critic → conditional router:
        - thin/ambiguous citation evidence + retry budget
            → citation_tracer (refined search) → critic
        - otherwise → report_generator → END

The citation refinement is intentionally limited to one pass. Citation
candidates are never promoted to verified citations merely because the router
ran a second search.
"""

from __future__ import annotations

import logging

from langgraph.graph import END, START, StateGraph

from backend.graph.nodes import (
    citation_tracer_agent,
    consent_license_agent,
    critic_aggregator_agent,
    duplication_agent,
    ingest_node,
    related_work_agent,
    report_generator_node,
)
from backend.models import SentinelGraphState

logger = logging.getLogger("datasentinel.workflow")

MAX_CITATION_RETRIES = 1

# Canonical node names used for SSE events and the frontend stepper.
NODE_INGEST = "ingest"
NODE_CONSENT = "consent_agent"
NODE_CITATION = "citation_tracer"
NODE_DUPLICATION = "duplication_agent"
NODE_RELATED = "related_work_agent"
NODE_CRITIC = "critic_aggregator"
NODE_REPORT = "report_generator"

PARALLEL_AGENTS = [
    NODE_CONSENT,
    NODE_CITATION,
    NODE_DUPLICATION,
    NODE_RELATED,
]


def route_after_critic(state: dict) -> str:
    """Route to one citation refinement pass when evidence is weak."""
    quality = state.get("citation_evidence_quality", "unknown")
    retries = int(state.get("citation_retry_count", 0) or 0)
    refined = bool(state.get("citation_search_refined", False))

    if (
        refined
        and quality in ("thin", "ambiguous")
        and retries < MAX_CITATION_RETRIES
    ):
        logger.info(
            "router: citation evidence '%s' — routing back for refined search",
            quality,
        )
        return NODE_CITATION

    logger.info(
        "router: citation evidence '%s' — routing to report",
        quality,
    )
    return NODE_REPORT


def build_graph():
    graph = StateGraph(SentinelGraphState)

    graph.add_node(NODE_INGEST, ingest_node)
    graph.add_node(NODE_CONSENT, consent_license_agent)
    graph.add_node(NODE_CITATION, citation_tracer_agent)
    graph.add_node(NODE_DUPLICATION, duplication_agent)
    graph.add_node(NODE_RELATED, related_work_agent)
    graph.add_node(NODE_CRITIC, critic_aggregator_agent)
    graph.add_node(NODE_REPORT, report_generator_node)

    # Fan-out after ingest.
    graph.add_edge(START, NODE_INGEST)
    for agent in PARALLEL_AGENTS:
        graph.add_edge(NODE_INGEST, agent)

    # Fan-in: critic runs after all four initial agents complete.
    for agent in PARALLEL_AGENTS:
        graph.add_edge(agent, NODE_CRITIC)

    # Critic may request exactly one refined citation pass.
    graph.add_conditional_edges(
        NODE_CRITIC,
        route_after_critic,
        {
            NODE_CITATION: NODE_CITATION,
            NODE_REPORT: NODE_REPORT,
        },
    )
    graph.add_edge(NODE_CITATION, NODE_CRITIC)
    graph.add_edge(NODE_REPORT, END)

    return graph.compile()


# Compiled graph singleton for the API layer.
sentinel_graph = build_graph()